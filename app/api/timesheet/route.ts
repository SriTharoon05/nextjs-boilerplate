// // app/api/timesheet/route.ts
// import { NextResponse } from 'next/server';
// import * as cheerio from 'cheerio';

// const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

// export async function POST(request: Request) {
//   return handleRequest(request);
// }

// export async function GET(request: Request) {
//   return handleRequest(request);
// }

// async function handleRequest(request: Request) {
//   try {
//     let trinityAuth = '';
//     let weekEndingDay = '';

//     if (request.method === 'POST') {
//       const body = await request.json();
//       trinityAuth = body.trinityAuth || body['.TrinityAuth'] || '';
//       weekEndingDay = body.weekEndingDay || body.dt || '';
//     } else {
//       const url = new URL(request.url);
//       trinityAuth = url.searchParams.get('trinityAuth') || url.searchParams.get('.TrinityAuth') || '';
//       weekEndingDay = url.searchParams.get('weekEndingDay') || url.searchParams.get('dt') || '';
//     }

//     if (!trinityAuth) {
//       return NextResponse.json({ error: 'Missing trinityAuth cookie value' }, { status: 400 });
//     }

//     if (!weekEndingDay) {
//       return NextResponse.json({ error: 'Missing weekEndingDay (e.g. 12/5/2025)' }, { status: 400 });
//     }

//     const formattedDate = weekEndingDay.includes('-')
//       ? weekEndingDay.split('-').join('/')
//       : weekEndingDay;

//     const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

//     const response = await fetch(targetUrl, {
//       headers: {
//         'Cookie': `.TrinityAuth=${trinityAuth}`,
//         'User-Agent':
//           'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
//       },
//       cache: 'no-store',
//     });

//     const html = await response.text();

//     if (!response.ok) {
//       return new NextResponse(
//         `Target server error ${response.status}: ${html.substring(0, 500)}`,
//         { status: response.status }
//       );
//     }

//     // ----------------------------
//     // Parse HTML and extract only required elements
//     // ----------------------------
//     const $ = cheerio.load(html);

//     const result = {
//       ttTable: $.html($('#ttTable')) || '',
//       Filter: $.html($('#filter')) || '',
//       IsSubmitted: $('#IsSubmitted').val() || $('#IsSubmitted').text() || '',
//       IsApproved: $('#IsApproved').val() || $('#IsApproved').text() || '',
//     };

//     return NextResponse.json(result, {
//       status: 200,
//       headers: {
//         'Cache-Control': 'no-store',
//         'Access-Control-Allow-Origin': '*',
//       },
//     });
//   } catch (error: any) {
//     console.error('Timesheet proxy error:', error);
//     return new NextResponse(`Proxy failed: ${error.message}`, { status: 500 });
//   }
// }

// export const dynamic = 'force-dynamic';
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
      return NextResponse.json({ error: 'Missing trinityAuth' }, { status: 400 });
    }

    if (!weekEndingDay) {
      return NextResponse.json({ error: 'Missing weekEndingDay (e.g. 1/16/2026)' }, { status: 400 });
    }

    // Normalize date format to MM/DD/YYYY
    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/')
      : weekEndingDay;

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

    const response = await fetch(targetUrl, {
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Target server returned ${response.status}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // ────────────────────────────────────────────────
    // 1. Header information
    // ────────────────────────────────────────────────
    const memberName = $('#filter td.labelleft')
      .first()
      .text()
      .replace('Member : ', '')
      .trim();

    const weekEndingStr = $('#WeekEndingDay').val() as string; // e.g. "1/16/2026"
    const [m, d, y] = weekEndingStr.split('/').map(Number);
    const weekEnding = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

    // Assuming Saturday to Friday week (common in many systems)
    const startDateObj = new Date(y, m - 1, d);
    startDateObj.setDate(startDateObj.getDate() - 6);
    const startDate = startDateObj.toISOString().split('T')[0];

    const totalHoursLogged = parseFloat($('tfoot .ttTotal.right').last().text().trim()) || 0;

    const isSubmitted = ($('#IsSubmitted').val() || '').toString().trim() === 'True';

    // Most timesheets show overall approval status — here it's empty → false
    // You can also check if ALL projects are approved
    const isApproved = ($('#IsApproved').val() || '').toString().trim() === 'True';

    // These fields are not present in HTML → set defaults or mark as unknown
    const header = {
      member: memberName || 'Unknown',
      memberId: parseInt($('input[name="ProjectTimeSheetList[0].AppUserID"]').val() as string) || 0,
      weekEnding,
      startDate,
      endDate: weekEnding,
      isSubmitted,
      isApproved,
      isFirstWeek: false,           // not in HTML
      isLastWeek: false,            // not in HTML
      isPartial: false,             // not in HTML
      isUIAPFullTimeEmployee: false, // not in HTML
      isFullTimeEmployee: false,    // not in HTML
      userType: 'Employee',         // placeholder — adjust if you have this info
      ttHeaderId: 0,                // not present
      totalHoursLogged,
    };

    // ────────────────────────────────────────────────
    // 2. Week days (from table header)
    // ────────────────────────────────────────────────
    const weekDays: any[] = [];
    const headerCells = $('thead tr.gridHeader th[align="right"]').slice(0, 7); // exclude Total

    const daysOfWeek = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    headerCells.each((i, el) => {
      const text = $(el).text().trim();
      const [dayShort, dateNum] = text.split('\n').map(s => s.trim());
      const day = daysOfWeek[i];
      const date = `${y}-${(m).toString().padStart(2, '0')}-${dateNum.padStart(2, '0')}`;

      weekDays.push({
        date,
        day,
        dayNum: i + 1,
      });
    });

    // ────────────────────────────────────────────────
    // 3. Projects
    // ────────────────────────────────────────────────
    const projects: any[] = [];

    let currentCategory = '';

    $('tbody > tr').each((i, row) => {
      const $row = $(row);

      // Category header row
      if ($row.hasClass('Direct') || $row.hasClass('In-Direct') || $row.hasClass('OverHead') || $row.attr('id')?.startsWith('billingType-')) {
        currentCategory = $row.find('td').first().text().trim();
        return;
      }

      // Data row
      if ($row.hasClass('timeTrackEntryRow')) {
        const index = parseInt($row.attr('id') || '0');

        const projectName = $row.find('td').first().text().trim();

        // Hidden inputs (first set belongs to this row)
        const getVal = (name: string) =>
          $row.prevAll(`input[name$="${name}"]`).first().val() as string;

        const projectId = parseInt(getVal('ProjectID')) || 0;
        const budgetId = parseInt(getVal('BudgetID')) || 0;
        const budgetAssignmentId = parseInt(getVal('TTBudgetAssignmentID')) || 0;
        const hourlyTypeName = getVal('HourlyTypeName') || '';

        // Daily hours & IDs
        const dailyHours: Record<string, number> = {};
        const dailyIds: Record<string, number> = {};

        for (let d = 1; d <= 7; d++) {
          const input = $row.find(`input[id$="__D${d}"]`);
          dailyHours[`D${d}`] = parseFloat(input.val() as string) || 0;
          dailyIds[`D${d}ID`] = parseInt(getVal(`D${d}ID`)) || 0;
        }

        const rowTotal = parseFloat($row.find('td.ttTotalHrs').text().trim()) || 0;

        const usedAssignedText = $row.find('td:contains("/")').text().trim();
        const [usedStr, assignedStr] = usedAssignedText.split('/').map(s => s.trim());
        const usedHours = parseFloat(usedStr.replace(/[^0-9.]/g, '')) || 0;
        const assignedHours = parseFloat(assignedStr.replace(/[^0-9.]/g, '')) || 0;

        const availableHours = parseFloat($row.find('td.ttAvailableHrs').text().trim()) || 0;

        const approver = $row.find('td').eq(-3).text().trim();

        const statusCell = $row.find('td').eq(-4).text().trim();
        const projectIsApproved = statusCell.includes('Approved') || getVal('IsApproved') === 'True';
        const projectIsSubmitted = getVal('IsSubmitted') === 'True';

        projects.push({
          index,
          category: currentCategory,
          projectName,
          projectId,
          budgetId,
          budgetAssignmentId,
          billingType: hourlyTypeName, // or from another column if different
          hourlyTypeName,
          availableHours,
          usedHours,
          assignedHours,
          usedAssignedDisplay: usedAssignedText,
          approver,
          markAsHiddenId: $row.find('input.ttMarkAsHiddenCheckbox').attr('id') || '',
          isSubmitted: projectIsSubmitted,
          isApproved: projectIsApproved,
          monthlyUsed: parseFloat(getVal('MonthlyUsed')) || 0,
          maxHrs: parseFloat(getVal('MaxHrs')) || 0,
          dailyHours: { ...dailyHours, ...dailyIds },
          rowTotal,
        });
      }
    });

    const result = {
      header,
      weekDays,
      projects,
    };

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Timesheet parsing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';