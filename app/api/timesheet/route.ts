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

$('tbody tr').each((_, row) => {
  const $row = $(row);

  // Category header rows
  if ($row.attr('id')?.startsWith('billingType-') || $row.hasClass('Direct') || $row.hasClass('In-Direct') || $row.hasClass('OverHead')) {
    currentCategory = $row.find('td').first().text().trim();
    return;
  }

  // Skip if not a data row
  if (!$row.hasClass('timeTrackEntryRow')) return;

  const rowId = $row.attr('id') || '0';
  const index = parseInt(rowId);

  const projectName = $row.find('td').first().text().trim();

  // Helper to get hidden input value just before this row
  const getHiddenVal = (field: string) => {
    return $row.prevAll(`input[name$="${field}"]`).first().val() as string ?? '0';
  };

  const projectId          = parseInt(getHiddenVal('ProjectID')) || 0;
  const budgetId           = parseInt(getHiddenVal('BudgetID')) || 0;
  const budgetAssignmentId = parseInt(getHiddenVal('TTBudgetAssignmentID')) || 0;
  const hourlyTypeName     = getHiddenVal('HourlyTypeName') || '';
  const isApprovedStr      = getHiddenVal('IsApproved') || 'False';
  const isSubmittedStr     = getHiddenVal('IsSubmitted') || 'False';
  const monthlyUsed        = parseFloat(getHiddenVal('MonthlyUsed')) || 0;
  const maxHrs             = parseFloat(getHiddenVal('MaxHrs')) || 0;

  // Daily hours from visible inputs in this row
  const dailyHours: Record<string, any> = {};
  for (let d = 1; d <= 7; d++) {
    const input = $row.find(`input[name$=".D${d}"]`);
    const idInput = $row.prevAll(`input[name$=".D${d}ID"]`).first();
    dailyHours[`D${d}`]   = parseFloat(input.val() as string) || 0;
    dailyHours[`D${d}ID`] = parseInt(idInput.val() as string) || 0;
  }

  const rowTotalText = $row.find('td.ttTotalHrs').text().trim();
  const rowTotal = parseFloat(rowTotalText) || 0;

  // Used / Assigned column (usually 2nd last or 3rd last td)
  const usedAssignedTd = $row.find('td.right').filter((_, el) => $(el).text().includes('/')).first();
  let usedAssignedDisplay = usedAssignedTd.text()
    .replace(/\n\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Parse used & assigned numbers
  let usedHours = 0;
  let assignedHours = 0;

  if (usedAssignedDisplay.includes('/')) {
    const [usedPart, assignedPart] = usedAssignedDisplay.split('/').map(s => s.trim());
    usedHours     = parseFloat(usedPart.replace(/[^0-9.]/g, '')) || 0;
    assignedHours = parseFloat(assignedPart.replace(/[^0-9.]/g, '')) || 0;
  }

  // For Weekly billing → this week's used hours usually = row total (not cumulative used)
  const isWeekly = hourlyTypeName.toLowerCase() === 'weekly';
  const thisWeekUsed = isWeekly ? rowTotal : usedHours;

  // Available hours
  const availableTd = $row.find('td.ttAvailableHrs');
  const availableHours = parseFloat(availableTd.text().trim()) || 0;

  // Approver (usually the column before Mark as Hidden)
  const approverTd = $row.find('td').slice(-3, -2); // adjust if structure changes
  let approver = approverTd.text().trim();

  // Status column (contains "Approved" label or empty)
  const statusTd = $row.find('td').slice(-4, -3);
  const statusText = statusTd.text().trim();
  const projectIsApproved = statusText.includes('Approved') || isApprovedStr === 'True';

  // If approver is empty or looks wrong → fallback
  if (!approver || approver === 'Approved') {
    approver = statusTd.prev().text().trim(); // try one column earlier
  }

  projects.push({
    index,
    category: currentCategory,
    projectName,
    projectId,
    budgetId,
    budgetAssignmentId,
    billingType: hourlyTypeName, // or parse from Billing Type column if needed
    hourlyTypeName,
    availableHours,
    usedHours: thisWeekUsed,       // most important fix for Weekly entries
    assignedHours,
    usedAssignedDisplay: usedAssignedDisplay.replace(/\s+/g, ' ').trim(),
    approver,
    markAsHiddenId: $row.find('input.ttMarkAsHiddenCheckbox').attr('id') || '',
    isSubmitted: isSubmittedStr === 'True',
    isApproved: projectIsApproved,
    monthlyUsed,
    maxHrs,
    dailyHours,
    rowTotal,
  });
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