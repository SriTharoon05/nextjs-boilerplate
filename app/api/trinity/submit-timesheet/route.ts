// pages/api/trinity/submit-timesheet.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { dt, hours, action } = req.body;
  // dt = "11/28/2025" (week ending date)
  // hours = array of 8 objects (one per project row)
  // action = "save" | "submit" | "cancel"

  if (!dt || !hours || !action || !['save', 'submit', 'cancel'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid parameters: dt, hours[], action required',
    });
  }

  // Forward the user's Trinity cookies automatically
  const cookieHeader = req.headers.cookie || '';
  if (!cookieHeader.includes('.TrinityAuth')) {
    return res.status(401).json({ success: false, message: 'Trinity session expired' });
  }

  try {
    // Build FormData exactly like the real browser does
    const formData = new URLSearchParams();

    // Hidden fields from the real form (critical!)
    formData.append('__RequestVerificationToken', extractTokenFromCookies(cookieHeader) || '');
    formData.append('IsLastWeek', 'False');
    formData.append('IsFirstWeek', 'False');
    formData.append('IsPartial', 'False');
    formData.append('IsSubmitted', 'True');
    formData.append('IsUIAPFullTimeEmployee', 'True');
    formData.append('IsFullTimeEmployee', 'True');
    formData.append('AppUserID', '1641');
    formData.append('WeekStartDay', '11/22/2025 12:00:00 AM'); // will be dynamic later
    formData.append('TTHeaderID', '64289');
    formData.append('UserType', 'FTEMP');
    formData.append('projectCount', '8');
    formData.append('WeekEndingDay', dt);

    // Append hours for each project (index 0 to 7)
    hours.forEach((row: any, index: number) => {
      const i = index.toString();
      formData.append(`ProjectTimeSheetList[${index}].AppUserID`, '1641');
      formData.append(`ProjectTimeSheetList[${index}].BudgetID`, row.BudgetID);
      formData.append(`ProjectTimeSheetList[${index}].TTBudgetAssignmentID`, row.TTBudgetAssignmentID);
      formData.append(`ProjectTimeSheetList[${index}].D1`, (row.D1 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D2`, (row.D2 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D3`, (row.D3 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D4`, (row.D4 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D5`, (row.D5 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D6`, (row.D6 || 0).toString());
      formData.append(`ProjectTimeSheetList[${index}].D7`, (row.D7 || 0).toString());
      // Hidden IDs (important for existing entries)
      formData.append(`ProjectTimeSheetList[${index}].D1ID`, row.D1ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D2ID`, row.D2ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D3ID`, row.D3ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D4ID`, row.D4ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D5ID`, row.D5ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D6ID`, row.D6ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].D7ID`, row.D7ID || '0');
      formData.append(`ProjectTimeSheetList[${index}].HourlyTypeName`, row.HourlyTypeName || 'Weekly');
      formData.append(`ProjectTimeSheetList[${index}].ProjectID`, row.ProjectID.toString());
      formData.append(`ProjectTimeSheetList[${index}].IsApproved`, 'False');
      formData.append(`ProjectTimeSheetList[${index}].IsSubmitted`, 'True');
      formData.append(`ProjectTimeSheetList[${index}].MonthlyUsed`, '0');
      formData.append(`ProjectTimeSheetList[${index}].MaxHrs`, '0.00');
    });

    // This is the key: tells Trinity what button was clicked
    if (action === 'submit') {
      formData.append('submitButton', 'Submit');
    } else if (action === 'save') {
      formData.append('submitButton', 'Save');
    }
    // cancel does nothing — just redirects

    const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        'Origin': 'https://portal.ubtiinc.com',
        'Referer': `https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry?dt=${encodeURIComponent(dt)}`,
      },
      body: formData.toString(),
    });

    const text = await response.text();

    // Trinity returns full HTML on success too, but with success message inside
    if (text.includes('Timesheet saved successfully') || text.includes('Timesheet submitted successfully')) {
      return res.status(200).json({
        success: true,
        message:
          action === 'submit'
            ? 'Timesheet submitted successfully!'
            : 'Timesheet saved successfully!',
        action,
      });
    }

    // Look for known error messages
    if (text.includes('Please enter minimum 45 hours') || text.includes('Please enter minimum 40 hours')) {
      return res.status(400).json({
        success: false,
        message: 'Minimum hours requirement not met (45 hrs for UIAP full-time employees)',
      });
    }

    if (text.includes('Row Total Hours can\'t exceed Available Hours')) {
      return res.status(400).json({
        success: false,
        message: 'One or more rows exceed available hours',
      });
    }

    // Generic fallback
    return res.status(400).json({
      success: false,
      message: 'Failed to save/submit timesheet',
      debug: text.substring(0, 500), // first 500 chars for debugging
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// Helper: extract anti-forgery token if needed (usually in cookie, but fallback)
function extractTokenFromCookies(cookieHeader: string): string | null {
  const match = cookieHeader.match(/__RequestVerificationToken=([^;]+)/);
  return match ? match[1] : null;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};