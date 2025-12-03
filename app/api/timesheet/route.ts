// app/api/timesheet/route.ts
import { NextResponse } from 'next/server';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

export async function POST(request: Request) {
  return handleRequest(request);
}

export async function GET(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    // === Extract auth & date ===
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
      ? weekEndingDay.split('-').reverse().join('/')  // 5/12/2025 → 2025/12/5
      : weekEndingDay;

    // === Fetch raw HTML from Trinity ===
    const response = await fetch(`${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`, {
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });

    const html = await response.text();

    if (!response.ok || html.includes('Login')) {
      return NextResponse.json({ error: 'Invalid session or access denied' }, { status: 401 });
    }

    // =================================================================
    // PURE STRING + REGEX PARSING — NO CHEERIO, NO PARSING ERRORS EVER
    // =================================================================

    const result: any = {
      header: {},
      weekDays: [],
      projects: [],
    };

    // 1. Extract all ProjectTimeSheetList hidden fields
    const hiddenFields: Record<string, string> = {};
    const hiddenRegex = /name=["']ProjectTimeSheetList\[(\d+)\]\.([^"']+)["'][^>]*value=["']([^"']*)["']/g;
    let match;
    while ((match = hiddenRegex.exec(html)) !== null) {
      const [ , idx, field, value ] = match;
      hiddenFields[`${idx}|${field}`] = value || '';
    }

    // 2. Header info
    result.header = {
      member: (html.match(/Member\s*:\s*<\/span>\s*<\/td>\s*<td[^>]*>([^<]+)</i) || [])[1]?.trim() || 'Unknown',
      memberId: parseInt((html.match(/id=["']AppUserID["'][^>]*value=["'](\d+)/i) || [])[1] || '0'),
      weekEnding: (html.match(/id=["']WeekEndingDay["'][^>]*value=["']([^"']+)/i) || [])[1] || formattedDate,
      startDate: (html.match(/id=["']WeekStartDay["'][^>]*value=["']([^"']+)/i) || [])[1] || formattedDate,
      ttHeaderId: parseInt((html.match(/id=["']TTHeaderID["'][^>]*value=["'](\d+)/i) || [])[1] || '0'),
      isSubmitted: /id=["']IsSubmitted["'][^>]*value=["']True/i.test(html),
      totalHoursLogged: 0,
    };

    // 3. Week days (from table header)
    const thMatches = [...html.matchAll(/<th[^>]*class=["'][^"']*gridHeader[^"']*["'][^>]*>([^<]*?)<br[^>]*>\s*(\d+)/gi)];
    const baseDate = new Date(result.header.startDate.split('/').reverse().join('-'));
    result.weekDays = thMatches.slice(0, 7).map((m, i) => {
      const dayName = m[1].trim() || ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i];
      const dayNum = parseInt(m[2]);
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      return {
        date: date.toISOString().split('T')[0],
        day: dayName,
        dayNum,
      };
    });

    // 4. Detect categories (In-Direct, OverHead, etc.)
    let currentCategory = 'Uncategorized';
    const categoryRegex = /<tr[^>]*class=["'][^"']*budgHeaders[^"']*["'][^>]*>[\s\S]*?<td[^>]*>([^<]+)</gi;
    const categoryMatches = [...html.matchAll(categoryRegex)];

    // 5. Extract project rows
    const rowRegex = /<tr[^>]*class=["'][^"'] alienate timeTrackEntryRow[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi;
    let rowMatch;
    let projectIndex = 0;
    let categoryIndex = 0;

    while ((rowMatch = rowRegex.exec(html)) !== null && projectIndex < 100) {
      const rowHtml = rowMatch[0];

      // Update current category if needed
      while (categoryIndex < categoryMatches.length) {
        const catRowIndex = html.indexOf(categoryMatches[categoryIndex][0]);
        const thisRowIndex = html.indexOf(rowHtml);
        if (catRowIndex < thisRowIndex) {
          currentCategory = categoryMatches[categoryIndex][1].trim();
          categoryIndex++;
        } else {
          break;
        }
      }

      // Extract visible data
      const nameMatch = rowHtml.match(/<td[^>]*class=["'][^"']*ttProjectName[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
      const projectName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Project';

      const usedAssignedMatch = rowHtml.match(/<td[^>]*>\s*([\d.]+)\s*\/\s*([\d.]+)/);
      const usedHours = usedAssignedMatch ? parseFloat(usedAssignedMatch[1]) : 0;
      const assignedHours = usedAssignedMatch ? parseFloat(usedAssignedMatch[2]) : 0;

      const availableMatch = rowHtml.match(/class=["']ttAvailableHrs["'][^>]*>\s*([\d.]+)/i);
      const availableHours = availableMatch ? parseFloat(availableMatch[1]) : 0;

      const approverMatch = [...rowHtml.matchAll(/<td[^>]*>([^<]+)</g)].slice(-2, -1)[0];
      const approver = approverMatch ? approverMatch[1].trim() : '';

      // Hidden data for this row
      const hidden: any = {};
      Object.keys(hiddenFields).forEach(key => {
        const [idx, field] = key.split('|');
        if (parseInt(idx) === projectIndex) {
          let val: any = hiddenFields[key];
          if (['ProjectID','BudgetID','TTBudgetAssignmentID','MonthlyUsed','MaxHrs'].includes(field)) {
            val = parseInt(val) || 0;
          }
          if (field.includes('D') && field.includes('ID')) {
            val = parseInt(val) || 0;
          }
          if (field.match(/^D\d+$/)) {
            val = parseFloat(val) || 0;
          }
          hidden[field] = val;
        }
      });

      // Daily hours
      const dailyHours: any = {};
      let rowTotal = 0;
      ['D1','D2','D3','D4','D5','D6','D7'].forEach(d => {
        const val = parseFloat(hidden[d] || '0') || 0;
        dailyHours[d] = val;
        dailyHours[`${d}ID`] = parseInt(hidden[`${d}ID`] || '0') || 0;
        rowTotal += val;
      });

      result.projects.push({
        index: projectIndex,
        category: currentCategory,
        projectName,
        projectId: hidden.ProjectID || null,
        budgetId: hidden.BudgetID || null,
        budgetAssignmentId: hidden.TTBudgetAssignmentID || null,
        hourlyTypeName: hidden.HourlyTypeName || 'Unknown',
        availableHours,
        usedHours,
        assignedHours,
        usedAssignedDisplay: `${usedHours} / ${assignedHours}`,
        approver,
        markAsHiddenId: `${hidden.ProjectID || ''}-${hidden.BudgetID || ''}`,
        isSubmitted: !!hidden.IsSubmitted,
        isApproved: !!hidden.IsApproved,
        monthlyUsed: hidden.MonthlyUsed || 0,
        maxHrs: hidden.MaxHrs || 0,
        dailyHours,
        rowTotal,
      });

      projectIndex++;
    }

    result.header.totalHoursLogged = result.projects.reduce((sum: number, p: any) => sum + p.rowTotal, 0);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    console.error('Timesheet proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch/parse timesheet', details: error.message },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';