// app/api/trinity/save/route.ts
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic'; // important for cookies & real-time

export async function POST(request: NextRequest) {
  try {
    const { dt, action, hours } = await request.json();

    if (!dt || !action || !hours || !['save', 'submit'].includes(action)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing dt / action / hours' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Forward Trinity cookie exactly as the browser sends it
    const cookieHeader = request.headers.get('cookie') || '';
    if (!cookieHeader.includes('.TrinityAuth=')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Trinity session missing' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Calculate week start (Sunday → Saturday)
    const weekEnding = new Date(dt + ' 00:00:00');
    const weekStart = new Date(weekEnding);
    weekStart.setDate(weekEnding.getDate() - 6);

    const formattedWeekStart = weekStart.toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).replace(',', '');

    // Build form exactly like the real portal
    const form = new URLSearchParams();
    form.append('IsLastWeek', 'False');
    form.append('IsFirstWeek', 'False');
    form.append('IsPartial', 'False');
    form.append('IsSubmitted', action === 'submit' ? 'True' : 'False');
    form.append('IsUIAPFullTimeEmployee', 'True');
    form.append('IsFullTimeEmployee', 'True');
    form.append('AppUserID', '1641');                    // ← change if yours is different
    form.append('WeekStartDay', formattedWeekStart);
    form.append('TTHeaderID', '64289');                  // ← will make dynamic later
    form.append('UserType', 'FTEMP');
    form.append('projectCount', hours.length.toString());
    form.append('WeekEndingDay', dt);
    form.append('TimeTrackEntryViewModel.WeekEndingDate', dt);
    form.append('submitButton', action === 'submit' ? 'Submit' : 'Save');

    hours.forEach((row: any, i: number) => {
      const p = `ProjectTimeSheetList[${i}]`;
      form.append(`${p}.AppUserID`, '1641');
      form.append(`${p}.BudgetID`, row.BudgetID.toString());
      form.append(`${p}.TTBudgetAssignmentID`, row.TTBudgetAssignmentID.toString());
      form.append(`${p}.ProjectID`, row.ProjectID.toString());
      form.append(`${p}.HourlyTypeName`, row.HourlyTypeName || 'Weekly');

      form.append(`${p}.D1`, (row.D1 ?? 0).toString());
      form.append(`${p}.D2`, (row.D2 ?? 0).toString());
      form.append(`${p}.D3`, (row.D3 ?? 0).toString());
      form.append(`${p}.D4`, (row.D4 ?? 0).toString());
      form.append(`${p}.D5`, (row.D5 ?? 0).toString());
      form.append(`${p}.D6`, (row.D6 ?? 0).toString());
      form.append(`${p}.D7`, (row.D7 ?? 0).toString());

      form.append(`${p}.D1ID`, (row.D1ID ?? 0).toString());
      form.append(`${p}.D2ID`, (row.D2ID ?? 0).toString());
      form.append(`${p}.D3ID`, (row.D3ID ?? 0).toString());
      form.append(`${p}.D4ID`, (row.D4ID ?? 0).toString());
      form.append(`${p}.D5ID`, (row.D5ID ?? 0).toString());
      form.append(`${p}.D6ID`, (row.D6ID ?? 0).toString());
      form.append(`${p}.D7ID`, (row.D7ID ?? 0).toString());

      form.append(`${p}.IsApproved`, 'False');
      form.append(`${p}.IsSubmitted`, action === 'submit' ? 'True' : 'False');
      form.append(`${p}.MonthlyUsed`, '0');
      form.append(`${p}.MaxHrs`, '0.00');
    });

    const res = await fetch('https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://portal.ubtiinc.com',
        'Referer': `https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry?dt=${encodeURIComponent(dt + ' 00:00:00')}`,
      },
      body: form,
    });

    const text = await res.text();

    if (text.includes('saved successfully') || text.includes('submitted successfully') || text.includes('fa-check-circle')) {
      return new Response(
        JSON.stringify({
          success: true,
          message: action === 'submit'
            ? 'Timesheet submitted successfully!'
            : 'Timesheet saved successfully!',
          action,
          dt,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Common errors
    if (text.includes('minimum 40 hours') || text.includes('minimum 45 hours')) {
      return new Response(JSON.stringify({ success: false, message: 'Minimum hours not met' }), { status: 400 });
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed – check hours or session',
        debug: text.slice(0, 500),
      }),
      { status: 400 }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Server error' }),
      { status: 500 }
    );
  }
}