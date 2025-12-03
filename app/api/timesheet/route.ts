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

    let html = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: `Trinity server error ${response.status}`, details: html.substring(0, 500) },
        { status: response.status }
      );
    }

    // ———————— PRE-PROCESS HTML TO FIX MALFORMED TAGS ————————
    // Fix common issues like </td"> -> </td>
    html = html.replace(/<\/t[dg][d]\s*["'>]/g, '</td>');
    html = html.replace(/<t[dg][d]\s*["'<]/g, '<td ');
    // Fix unclosed attributes/quotes
    html = html.replace(/(\w+)=["']([^"']*)["']*>/g, '$1="$2">');
    html = html.replace(/(\w+)=["']([^"']*)$/gm, '$1="$2"');
    // Remove extra quotes in tags
    html = html.replace(/"\s*<\/t[dg]/g, '</td');
    // General cleanup for malformed HTML
    html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, ''); // Remove scripts if causing issues
    html = html.trim();

    // ———————— PARSE HTML TO COMPREHENSIVE JSON ————————
    const $ = cheerio.load(html, { xmlMode: false, decodeEntities: false });

    // Extract Header
    const header: any = {};
    header.member = $('td.labelleft:contains("Member :")').next().text().trim().replace(/^Member\s*:\s*/, '');
    header.memberId = parseInt($('#AppUserID').val() as string) || 0;
    const weekEndingVal = $('#WeekEndingDay').val() as string;
    header.weekEnding = new Date(weekEndingVal.replace(/\//g, '-')).toISOString().split('T')[0];
    const startDateVal = $('#WeekStartDay').val() as string;
    header.startDate = new Date(startDateVal.replace(/\//g, '-')).toISOString().split('T')[0];
    header.endDate = header.weekEnding;
    header.isSubmitted = $('#IsSubmitted').val() === 'True';
    header.isApproved = false; // Assume false if not explicitly present
    header.isFirstWeek = $('#IsFirstWeek').val() === 'True';
    header.isLastWeek = $('#IsLastWeek').val() === 'True';
    header.isPartial = $('#IsPartial').val() === 'True';
    header.isUIAPFullTimeEmployee = $('#IsUIAPFullTimeEmployee').val() === 'True';
    header.isFullTimeEmployee = $('#IsFullTimeEmployee').val() === 'True';
    header.userType = $('#UserType').val() as string || 'FTEMP';
    header.ttHeaderId = parseInt($('#TTHeaderID').val() as string) || 0;
    header.totalHoursLogged = 0.00; // Will calculate later

    // Extract Week Days from table headers (columns 2-8)
    const weekDays: any[] = [];
    $('#ttTable thead tr.gridHeader th').slice(1, 8).each((i, th) => {
      let text = $(th).html() || '';
      // Extract day abbr and number
      const dayMatch = text.match(/<br\s*\/?>\s*(\d+)/i);
      const dayNum = dayMatch ? parseInt(dayMatch[1]) : (29 + i); // Fallback to sequential
      text = text.replace(/<br\s*\/?>\s*\d+/, '').trim();
      const dayAbbr = text.replace(/\s+/g, ' ').trim(); // e.g., "Sat"
      
      // Calculate full date from startDate + offset
      let fullDate = new Date(header.startDate);
      fullDate.setDate(fullDate.getDate() + i);
      weekDays.push({
        date: fullDate.toISOString().split('T')[0],
        day: dayAbbr,
        dayNum,
      });
    });

    // Collect ALL hidden inputs, mapped by index
    const allHidden: Record<number, Record<string, any>> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name') || '';
      const value = $(el).attr('value') || '0';
      const match = name.match(/ProjectTimeSheetList\[(\d+)\]\.([^.]+)/);
      if (match) {
        const [, indexStr, field] = match;
        const index = parseInt(indexStr);
        if (!allHidden[index]) allHidden[index] = {};
        const parsedValue = field.match(/^(D\d+|MaxHrs|MonthlyUsed)$/i) 
          ? parseFloat(value) || 0 
          : (field.match(/^(Is[A-Za-z]+)$/i) ? value === 'True' : value);
        allHidden[index][field] = parsedValue;
      }
    });

    // Extract projects with categories
    let currentCategory = 'Unknown';
    const projects: any[] = [];
    let projectIndex = 0;

    // Find all tbody children, process headers and rows
    $('#ttTable tbody > *').each((i, elem) => {
      const $elem = $(elem);

      if ($elem.is('tr.budgHeaders')) {
        // Category header
        currentCategory = $elem.find('td').text().trim();
        return true; // continue
      }

      if ($elem.is('tr.timeTrackEntryRow')) {
        if (projectIndex >= Object.keys(allHidden).length) {
          console.warn('More rows than hidden data, skipping');
          return true;
        }

        const hidden = allHidden[projectIndex] || {};
        const tds = $elem.find('td');
        if (tds.length < 12) return true; // Skip invalid rows

        const projectName = tds.eq(0).text().trim();
        const availableHrsText = tds.eq(10).find('.ttAvailableHrs').text().trim(); // Available Hrs column
        const usedAssignedText = tds.eq(11).text().trim(); // Used / Assigned
        const [usedStr, assignedStr = '0'] = usedAssignedText ? usedAssignedText.split('/').map(s => s.trim()) : ['0', '0'];
        const approver = tds.eq(13).text().trim(); // Approver
        const markAsHiddenCheckbox = tds.eq(14).find('input[type="checkbox"]');
        const markAsHiddenId = markAsHiddenCheckbox.attr('id') || `${hidden.ProjectID || 'unknown'}-${hidden.BudgetID || 'unknown'}`;

        // Daily hours: get current values from inputs
        const dailyHours: any = {};
        let rowTotal = 0;
        ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach((day, dayIndex) => {
          const inputSelector = `input[name="ProjectTimeSheetList[${projectIndex}].${day}"]`;
          const input = $elem.find(inputSelector);
          const dayValue = parseFloat(input.val() as string) || 0;
          rowTotal += dayValue;
          const dayIdField = `${day}ID`;
          dailyHours[day] = dayValue;
          dailyHours[`${day}ID`] = hidden[dayIdField] || 0;
        });

        // Override rowTotal if .ttTotalHrs exists
        const totalHrsEl = $elem.find('.ttTotalHrs');
        if (totalHrsEl.length) {
          rowTotal = parseFloat(totalHrsEl.text().trim()) || rowTotal;
        }

        projects.push({
          index: projectIndex,
          category: currentCategory,
          projectName,
          projectId: hidden.ProjectID || null,
          budgetId: hidden.BudgetID || null,
          budgetAssignmentId: hidden.TTBudgetAssignmentID || null,
          billingType: hidden.HourlyTypeName || 'Absolute',
          hourlyTypeName: hidden.HourlyTypeName || 'Unknown',
          availableHours: parseFloat(availableHrsText) || 0,
          usedHours: parseFloat(usedStr) || 0,
          assignedHours: parseFloat(assignedStr) || 0,
          usedAssignedDisplay: usedAssignedText,
          approver,
          markAsHiddenId,
          isSubmitted: !!hidden.IsSubmitted,
          isApproved: !!hidden.IsApproved,
          monthlyUsed: hidden.MonthlyUsed || 0,
          maxHrs: hidden.MaxHrs || 0,
          dailyHours,
          rowTotal,
        });

        projectIndex++;
      }
    });

    // Calculate total hours
    header.totalHoursLogged = projects.reduce((sum, p) => sum + p.rowTotal, 0).toFixed(2) as any;

    // Fallback projectCount
    const projectCount = parseInt($('#projectCount').val() as string) || projects.length;

    const result = {
      header,
      weekDays,
      projects,
      projectCount, // Add for completeness
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