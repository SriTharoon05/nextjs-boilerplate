// pages/api/trinity/save.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { dt, action, hours } = req.body;

  // Basic validation
  if (!dt || !action || !hours || !['save', 'submit'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid fields: dt, action ("save"|"submit"), hours[] required',
    });
  }

  const cookieHeader = req.headers.cookie || '';
  if (!cookieHeader.includes('.TrinityAuth=')) {
    return res.status(401).json({ success: false, message: 'Trinity login session missing or expired' });
  }

  try {
    // Parse and validate date
    const weekEndingDate = new Date(dt + ' 00:00:00');
    if (isNaN(weekEndingDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    // Calculate week start (Sunday → Saturday week)
    const weekStartDate = new Date(weekEndingDate);
    weekStartDate.setDate(weekEndingDate.getDate() - 6);

    const formattedWeekStart = weekStartDate.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).replace(/,/, '');

    const formattedWeekEnding = weekEndingDate.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });

    // Build exact form data the real portal expects
    const formData = new URLSearchParams();

    // Hidden fields (critical!)
    formData.append('IsLastWeek', 'False');
    formData.append('IsFirstWeek', 'False');
    formData.append('IsPartial', 'False');
    formData.append('IsSubmitted', action === 'submit' ? 'True' : 'False');
    formData.append('IsUIAPFullTimeEmployee', 'True');
    formData.append('IsFullTimeEmployee', 'True');
    formData.append('AppUserID', '1641');                    // Change if your ID is different
    formData.append('WeekStartDay', formattedWeekStart);
    formData.append('TTHeaderID', '64289');              // Will be dynamic in future
    formData.append('UserType', 'FTEMP');
    formData.append('projectCount', hours.length.toString());
    formData.append('WeekEndingDay', dt);
    formData.append('TimeTrackEntryViewModel.WeekEndingDate', dt);

    // Button click simulation
    formData.append('submitButton', action === 'submit' ? 'Submit' : 'Save');

    // Append each project row
    hours.forEach((row: any, index: number) => {
      const prefix = `ProjectTimeSheetList[${index}]`;

      formData.append(`${prefix}.AppUserID`, '1641');
      formData.append(`${prefix}.BudgetID`, row.BudgetID.toString());
      formData.append(`${prefix}.TTBudgetAssignmentID`, row.TTBudgetAssignmentID.toString());
      formData.append(`${prefix}.ProjectID`, row.ProjectID.toString());
      formData.append(`${prefix}.HourlyTypeName`, row.HourlyTypeName || 'Weekly');

      // Daily hours
      formData.append(`${prefix}.D1`, (row.D1 || 0).toString());
      formData.append(`${prefix}.D2`, (row.D2 || 0).toString());
      formData.append(`${prefix}.D3`, (row.D3 || 0).toString());
      formData.append(`${prefix}.D4`, (row.D4 || 0).toString());
      formData.append(`${prefix}.D5`, (row.D5 || 0).toString());
      formData.append(`${prefix}.D6`, (row.D6 || 0).toString());
      formData.append(`${prefix}.D7`, (row.D7 || 0).toString());

      // Daily IDs (very important for edits!)
      formData.append(`${prefix}.D1ID`, (row.D1ID || 0).toString());
      formData.append(`${prefix}.D2ID`, (row.D2ID || 0).toString());
      formData.append(`${prefix}.D3ID`, (row.D3ID || 0).toString());
      formData.append(`${prefix}.D4ID`, (row.D4ID || 0).toString());
      formData.append(`${prefix}.D5ID`, (row.D5ID || 0).toString());
      formData.append(`${prefix}.D6ID`, (row.D6ID || 0).toString());
      formData.append(`${prefix}.D7ID`, (row.D7ID || 0).toString());

      // Static fields
      formData.append(`${prefix}.IsApproved`, 'False');
      formData.append(`${prefix}.IsSubmitted`, action === 'submit' ? 'True' : 'False');
      formData.append(`${prefix}.MonthlyUsed`, '0');
      formData.append(`${prefix}.MaxHrs`, '0.00');
    });

    // Final request to real Trinity portal
    const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        'Origin': 'https://portal.ubtiinc.com',
        'Referer': `https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry?dt=${encodeURIComponent(dt + ' 00:00:00')}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: formData.toString(),
    });

    const text = await response.text();

    // Success detection
    if (
      text.includes('Timesheet saved successfully') ||
      text.includes('Timesheet submitted successfully') ||
      text.includes('fa-check-circle') // fallback if message changes
    ) {
      return res.status(200).json({
        success: true,
        message: action === 'submit' ? 'Timesheet submitted successfully!' : 'Timesheet saved successfully!',
        action,
        dt,
      });
    }

    // Common errors
    if (text.includes('Please enter minimum 40 hours') || text.includes('Please enter minimum 45 hours')) {
      return res.status(400).json({
        success: false,
        message: 'Minimum weekly hours not met (usually 40–45 hrs required)',
      });
    }

    if (text.includes('Row Total Hours can\'t exceed Available Hours')) {
      return res.status(400).json({
        success: false,
        message: 'One or more rows exceed available budget/available hours',
      });
    }

    // Fallback error
    return res.status(400).json({
      success: false,
      message: 'Failed to save/submit timesheet – check hours and try again',
      debug: text.substring(0, 600), // helpful for debugging
    });
  } catch (error: any) {
    console.error('Trinity proxy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
}

// Increase body size limit (optional)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};