// app/api/timesheet/route.ts
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

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

    if (!trinityAuth) {
      return NextResponse.json({ error: 'Missing trinityAuth cookie value' }, { status: 400 });
    }
    if (!weekEndingDay) {
      return NextResponse.json({ error: 'Missing weekEndingDay (e.g. 12/5/2025)' }, { status: 400 });
    }

    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').join('/')
      : weekEndingDay;

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });

    const html = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: `Trinity server error ${response.status}`, details: html.substring(0, 500) },
        { status: response.status }
      );
    }

    // ———————— PARSE HTML TO COMPREHENSIVE JSON ————————
    const $ = cheerio.load(html);

    // Extract Header
    const header: any = {};
    header.member = $('td.labelleft:contains("Member :")').next().text().trim().replace('Member : ', '');
    header.memberId = parseInt($('#AppUserID').val() as string) || 0;
    header.weekEnding = new Date($('#WeekEndingDay').val() as string).toISOString().split('T')[0];
    header.startDate = new Date($('#WeekStartDay').val() as string).toISOString().split('T')[0];
    header.endDate = header.weekEnding;
    header.isSubmitted = $('#IsSubmitted').val() === 'True';
    header.isApproved = false; // Not directly in HTML, assume false if not present
    header.isFirstWeek = $('#IsFirstWeek').val() === 'True';
    header.isLastWeek = $('#IsLastWeek').val() === 'True';
    header.isPartial = $('#IsPartial').val() === 'True';
    header.isUIAPFullTimeEmployee = $('#IsUIAPFullTimeEmployee').val() === 'True';
    header.isFullTimeEmployee = $('#IsFullTimeEmployee').val() === 'True';
    header.userType = $('#UserType').val() as string;
    header.ttHeaderId = parseInt($('#TTHeaderID').val() as string) || 0;
    header.totalHoursLogged = 0.00; // Calculate from tfoot or sum rows

    // Extract Week Days from table headers
    const weekDays: any[] = [];
    $('#ttTable thead th').slice(1, 8).each((i, th) => {
      const text = $(th).html() || '';
      const dayMatch = text.match(/<br \/>\s*(\d+)/);
      const dayNum = dayMatch ? parseInt(dayMatch[1]) : 0;
      const dayAbbr = text.replace(/<br \/>\s*\d+/, '').trim();
      const fullDate = new Date(header.startDate);
      fullDate.setDate(fullDate.getDate() + i);
      weekDays.push({
        date: fullDate.toISOString().split('T')[0],
        day: dayAbbr,
        dayNum,
      });
    });

    // Collect ALL hidden inputs first, mapped by index
    const allHidden: Record<number, Record<string, any>> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name') || '';
      const value = $(el).attr('value') || '';
      const match = name.match(/ProjectTimeSheetList\[(\d+)\]\.(.*)/);
      if (match) {
        const [, indexStr, field] = match;
        const index = parseInt(indexStr);
        if (!allHidden[index]) allHidden[index] = {};
        allHidden[index][field] = isNaN(parseFloat(value)) ? value : parseFloat(value);
      }
    });

    // Extract categories (billing headers)
    let currentCategory = '';
    const projects: any[] = [];
    let projectIndex = 0;

    $('#ttTable tbody').children().each((i, elem) => {
      const $elem = $(elem);

      // If it's a category header
      if ($elem.hasClass('budgHeaders')) {
        currentCategory = $elem.text().trim();
        return;
      }

      // If it's a project row
      if ($elem.hasClass('timeTrackEntryRow')) {
        const hidden = allHidden[projectIndex] || {};
        const projectName = $elem.find('td').first().text().trim();
        const availableHrsText = $elem.find('.ttAvailableHrs').text().trim();
        const usedAssignedText = $elem.find('td:nth-child(12)').text().trim(); // Used / Assigned column (index 11, nth-child 12)
        const [usedStr, assignedStr] = usedAssignedText.split('/').map(s => s.trim());
        const approver = $elem.find('td:nth-last-child(2)').text().trim(); // Approver td
        const markAsHiddenCheckbox = $elem.find('.ttMarkAsHiddenCheckbox');
        const markAsHiddenId = markAsHiddenCheckbox.attr('id') || '';

        // Daily hours from inputs (default 0)
        const dailyHours: any = {};
        ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach(day => {
          const input = $elem.find(`input[name="${hidden[`${day}`]?.name || `ProjectTimeSheetList[${projectIndex}].${day}`}]`);
          const dayValue = parseFloat(input.val() as string) || 0;
          const dayIdField = `${day}ID`;
          const dayId = hidden[dayIdField] || 0;
          dailyHours[day] = dayValue;
          dailyHours[`${day}ID`] = dayId;
        });

        // Row total from .ttTotalHrs
        const rowTotal = parseFloat($elem.find('.ttTotalHrs').text().trim()) || 0;

        projects.push({
          index: projectIndex,
          category: currentCategory,
          projectName,
          projectId: hidden.ProjectID || null,
          budgetId: hidden.BudgetID || null,
          budgetAssignmentId: hidden.TTBudgetAssignmentID || null,
          billingType: hidden.HourlyTypeName || 'Absolute', // Assuming billingType same as hourly
          hourlyTypeName: hidden.HourlyTypeName || 'Unknown',
          availableHours: parseFloat(availableHrsText) || 0,
          usedHours: parseFloat(usedStr) || 0,
          assignedHours: parseFloat(assignedStr) || 0,
          usedAssignedDisplay: usedAssignedText,
          approver,
          markAsHiddenId,
          isSubmitted: hidden.IsSubmitted || false,
          isApproved: hidden.IsApproved || false,
          monthlyUsed: hidden.MonthlyUsed || 0,
          maxHrs: hidden.MaxHrs || 0,
          dailyHours,
          rowTotal,
        });

        projectIndex++;
      }
    });

    // Calculate totalHoursLogged (sum of rowTotals)
    header.totalHoursLogged = projects.reduce((sum, p) => sum + p.rowTotal, 0);

    const result = {
      header,
      weekDays,
      projects,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    console.error('Timesheet parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse timesheet', details: error.message },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';