// app/api/trinity/save/route.ts
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { dt, action, hours } = await request.json();

    if (!dt || !action || !hours || !['save', 'submit'].includes(action)) {
      return Response.json(
        { success: false, message: 'Invalid payload' },
        { status: 400 }
      );
    }

    const cookieHeader = request.headers.get('cookie') || '';
    if (!cookieHeader.includes('.TrinityAuth=')) {
      return Response.json(
        { success: false, message: 'No Trinity session' },
        { status: 401 }
      );
    }

    // Week start (Sunday → Saturday)
    const weekEnding = new Date(dt + ' 00:00:00');
    const weekStart = new Date(weekEnding);
    weekStart.setDate(weekEnding.getDate() - 6);
    const formattedWeekStart = weekStart.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).replace(',', '');

    const form = new URLSearchParams();

    // Hidden fields
    form.append('IsLastWeek', 'False');
    form.append('IsFirstWeek', 'False');
    form.append('IsPartial', 'False');
    form.append('IsSubmitted', action === 'submit' ? 'True' : 'False');
    form.append('IsUIAPFullTimeEmployee', 'True');
    form.append('IsFullTimeEmployee', 'True');
    form.append('AppUserID', '1641');                    // change if yours is different
    form.append('WeekStartDay', formattedWeekStart);
    form.append('TTHeaderID', '64289');                  // will be dynamic later
    form.append('UserType', 'FTEMP');
    form.append('projectCount', hours.length.toString());
    form.append('WeekEndingDay', dt);
    form.append('TimeTrackEntryViewModel.WeekEndingDate', dt);
    form.append('submitButton', action === 'submit' ? 'Submit' : 'Save');

    // Project rows
    hours.forEach((row: any, i: number) => {
      const p = `ProjectTimeSheetList[${i}]`;
      form.append(`${p}.AppUserID`, '1641');
      form.append(`${p}.BudgetID`, row.BudgetID?.toString() ?? '');
      form.append(`${p}.TTBudgetAssignmentID`, row.TTBudgetAssignmentID?.toString() ?? '');
      form.append(`${p}.ProjectID`, row.ProjectID?.toString() ?? '');
      form.append(`${p}.HourlyTypeName`, row.HourlyTypeName || 'Weekly');

      ['D1','D2','D3','D4','D5','D6','D7'].forEach(day => {
        form.append(`${p}.${day}`, (row[day] ?? 0).toString());
        form.append(`${p}.${day}ID`, (row[`${day}ID`] ?? 0).toString());
      });

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

    // SUCCESS HAS PRIORITY — check this first!
    const hasSuccessMessage = 
      text.includes('Timesheet saved successfully') ||
      text.includes('Timesheet submitted successfully') ||
      text.includes('fa-check-circle') ||
      text.includes('Your timesheet has been saved') ||
      text.includes('alert-success');

    if (hasSuccessMessage) {
      return Response.json({
        success: true,
        message: action === 'submit'
          ? 'Timesheet submitted successfully!'
          : 'Timesheet saved successfully!',
      });
    }

    // Only show minimum-hours warning if there was NO success
    if (text.includes('minimum 40 hours') || text.includes('minimum 45 hours')) {
      return Response.json(
        { success: false, message: 'Not enough hours to SUBMIT (Save works with any hours)' },
        { status: 400 }
      );
    }

    return Response.json(
      { success: false, message: 'Failed to save', debug: text.slice(0, 300) },
      { status: 400 }
    );

  } catch (err: any) {
    return Response.json(
      { success: false, message: 'Server error', error: err?.message },
      { status: 500 }
    );
  }
}