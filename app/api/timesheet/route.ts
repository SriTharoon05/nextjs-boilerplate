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

    // ———————— PARSE HTML TO JSON ————————
    const $ = cheerio.load(html);

    const projects: any[] = [];

    // Find all project rows
    $('#ttTable tbody tr.timeTrackEntryRow').each((index, row) => {
      const $row = $(row);

      // Extract hidden inputs in this row
      const hiddenInputs: Record<string, any> = {};
      $row.find('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name') || '';
        const value = $(el).attr('value') || '';
        const id = $(el).attr('id') || '';

        // Extract index from name like ProjectTimeSheetList[3].BudgetID
        const match = name.match(/ProjectTimeSheetList\[(\d+)\]\.(.*)/);
        if (match) {
          const [, rowIndex, field] = match;
          if (parseInt(rowIndex) === index) {
            hiddenInputs[field] = isNaN(parseFloat(value)) ? value : parseFloat(value);
          }
        }
      });

      // Extract day input names (D1 to D7)
      const inputNames: Record<string, string> = {};
      const dayIds: Record<string, number> = {};
      ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach(day => {
        const input = $row.find(`input[name*=".${day}"]`);
        if (input.length) {
          inputNames[day] = input.attr('name') || '';
          const idInput = $(`input[id*="${day}ID"][value]`).first();
          dayIds[`${day}ID`] = idInput.length ? parseInt(idInput.val() as string) || 0 : 0;
        }
      });

      // Extract visible data
      const projectName = $row.find('td').first().text().trim();
      const availableHrsText = $row.find('.ttAvailableHrs').text().trim();
      const usedAssignedText = $row.find('td').eq(11).text().trim(); // Used / Assigned column
      const [usedHrsStr, assignedHrsStr] = usedAssignedText.split('/').map(s => s.trim());

      projects.push({
        index,
        budgetId: hiddenInputs.BudgetID || null,
        budgetAssignmentId: hiddenInputs.TTBudgetAssignmentID || null,
        projectId: hiddenInputs.ProjectID || null,
        projectName,
        hourlyType: hiddenInputs.HourlyTypeName || 'Unknown',
        availableHours: parseFloat(availableHrsText) || 0,
        usedHours: parseFloat(usedHrsStr) || 0,
        maxHours: parseFloat(assignedHrsStr) || 0,
        inputNames,
        dayIds,
      });
    });

    const result = {
      weekEndingDay: $('#WeekEndingDay').val() || formattedDate,
      projectCount: projects.length,
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