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
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    const html = await response.text();

    if (!response.ok) {
      return new NextResponse(
        `Target server error ${response.status}: ${html.substring(0, 500)}`,
        { status: response.status }
      );
    }

    // ----------------------------
    // Parse HTML and extract only required elements
    // ----------------------------
    const $ = cheerio.load(html);

    const result = {
      ttTable: $('#ttTable').html() || '',
      Filter: $.html($('#filter')) || '',
      IsSubmitted: $('#IsSubmitted').val() || $('#IsSubmitted').text() || '',
      IsApproved: $('#IsApproved').val() || $('#IsApproved').text() || '',
    };

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Timesheet proxy error:', error);
    return new NextResponse(`Proxy failed: ${error.message}`, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
