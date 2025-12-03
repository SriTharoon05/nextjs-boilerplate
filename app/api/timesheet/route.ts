// app/api/timesheet/route.ts
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

// Ultra-robust HTML fixer — this is the magic that saves you from Trinity's garbage
function fixMalformedHtml(html: string): string {
  return html
    .replace(/<\/t[dr]"/g, '</td>')
    .replace(/<t[dr]"/g, '<td ')
    .replace(/<\/tr"/g, '</tr>')
    .replace(/(\w+)="([^"]*)$/gm, '$1="$2"')
    .replace(/(\w+)='([^']*)$/gm, "$1='$2'")
    .replace(/(\w+)=\s*([^>\s"'=]+)(?=[>\s])/g, '$1="$2"')
    .replace(/["']<\/td>/g, '</td>')
    .replace(/["']<\/tr>/g, '</tr>')
    .replace(/value="([^"]*)"([^>]*)/g, 'value="$1" $2')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  return handleRequest(request);
}

export async function GET(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    let trinityAuth = '';
    let weekEndingDay = '';

    if (request.method === 'POST') {
      const body = await request.json();
      trinityAuth = body.trinityAuth || body['.TrinityAuth'] || '';
      weekEndingDay = body.weekEndingDay || body.dt || '';
    } else {
      const url = new URL(request.url);
      trinityAuth = url.searchParams.get('trinityAuth') || url.searchParams.get('.TrinityAuth') || '';
      weekEndingDay = url.searchParams.get('weekEndingDay') || url.searchParams.get('dt') || '';
    }

    if (!trinityAuth || !weekEndingDay) {
      return NextResponse.json({ error: 'Missing trinityAuth or weekEndingDay' }, { status: 400 });
    }

    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/')  // 5/12/2025 → 2025/12/5 → 2025/12/5
      : weekEndingDay;

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

    const response = await fetch(targetUrl, {
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });

    let html = await response.text();
    if (!response.ok) {
      return NextResponse.json({ error: `Trinity error ${response.status}`, details: html.slice(0, 500) }, { status: response.status });
    }

    // FIX THE HTML FIRST — THIS IS CRITICAL
    html = fixMalformedHtml(html);

    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(html, {
        xmlMode: false,
        decodeEntities: false,
        lowerCaseTags: false,
        lowerCaseAttributeNames: false,
        recognizeSelfClosing: true,
      });
    } catch (e) {
      return NextResponse.json({ error: 'Cheerio failed even after fix', rawLength: html.length }, { status: 500 });
    }

    // ==================== HEADER ====================
    const header: any = {
      member: $('td:contains("Member :")').next('td').text().trim() || 'Unknown',
      memberId: parseInt($('#AppUserID').val() as string || '0') || 0,
      weekEnding: $('#WeekEndingDay').val() as string || formattedDate,
      startDate: $('#WeekStartDay').val() as string || formattedDate,
      ttHeaderId: parseInt($('#TTHeaderID').val() as string || '0') || 0,
      isSubmitted: $('#IsSubmitted').val() === 'True',
      totalHoursLogged: 0,
    };

    // ==================== WEEK DAYS ====================
    const weekDays: any[] = [];
    $('#ttTable thead th').slice(1, 8).each((i, el) => {
      const htmlContent = $(el).html() || '';
      const match = htmlContent.match(/(\w+)<br[^>]*>\s*(\d+)/i) || [];
      const day = match[1] || ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i];
      const num = parseInt(match[2]) || 0;
      const date = new Date(header.startDate);
      date.setDate(date.getDate() + i);
      weekDays.push({ date: date.toISOString().split('T')[0], day, dayNum: num });
    });

    // ==================== HIDDEN DATA ====================
    const hiddenData: Record<number, Record<string, any>> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name') || '';
      const value = $(el).attr('value') || '';
      const match = name.match(/ProjectTimeSheetList\[(\d+)\]\.(.*?)$/);
      if (match) {
        const idx = parseInt(match[1]);
        const key = match[2];
        if (!hiddenData[idx]) hiddenData[idx] = {};
        hiddenData[idx][key] = value;
      }
    });

    // ==================== PROJECTS ====================
    const projects: any[] = [];
    let currentCategory = 'Uncategorized';
    let index = 0;

    $('#ttTable tbody tr').each((_, row) => {
      const $row = $(row);

      // Category header
      if ($row.hasClass('budgHeaders') || $row.text().toLowerCase().includes('in-direct') || $row.text().toLowerCase().includes('overhead')) {
        currentCategory = $row.text().trim() || currentCategory;
        return;
      }

      // Actual project row
      if (!$row.hasClass('timeTrackEntryRow')) return;

      const cells = $row.find('td');
      if (cells.length < 12) return;

      const hidden = hiddenData[index] || {};
      const projectName = cells.eq(0).text().trim();
      const usedAssignedText = cells.eq(11).text().trim();
      const [used = '0', assigned = '0'] = usedAssignedText.split('/').map(s => s.trim());

      const dailyHours: any = {};
      let rowTotal = 0;
      ['D1','D2','D3','D4','D5','D6','D7'].forEach(d => {
        const val = parseFloat(hidden[d] || '0') || 0;
        dailyHours[d] = val;
        dailyHours[`${d}ID`] = parseInt(hidden[`${d}ID`] || '0') || 0;
        rowTotal += val;
      });

      projects.push({
        index,
        category: currentCategory,
        projectName,
        projectId: parseInt(hidden.ProjectID as string) || null,
        budgetId: parseInt(hidden.BudgetID as string) || null,
        budgetAssignmentId: parseInt(hidden.TTBudgetAssignmentID as string) || null,
        billingType: hidden.HourlyTypeName || 'Absolute',
        hourlyTypeName: hidden.HourlyTypeName || 'Unknown',
        availableHours: parseFloat(cells.eq(10).text()) || 0,
        usedHours: parseFloat(used) || 0,
        assignedHours: parseFloat(assigned) || 0,
        usedAssignedDisplay: usedAssignedText,
        approver: cells.eq(cells.length - 2).text().trim(),
        markAsHiddenId: `${hidden.ProjectID || ''}-${hidden.BudgetID || ''}`,
        isSubmitted: !!hidden.IsSubmitted,
        isApproved: !!hidden.IsApproved,
        monthlyUsed: parseInt(hidden.MonthlyUsed as string) || 0,
        maxHrs: parseFloat(hidden.MaxHrs as string) || 0,
        dailyHours,
        rowTotal,
      });

      index++;
    });

    header.totalHoursLogged = projects.reduce((sum, p) => sum + p.rowTotal, 0);

    return NextResponse.json(
      { header, weekDays, projects },
      { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (error: any) {
    console.error('Timesheet proxy error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';