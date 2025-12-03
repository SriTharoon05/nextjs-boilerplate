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
    let trinityAuth = '';
    let weekEndingDay = ''; // e.g. "12/5/2025" or "2025-12-05"

    if (request.method === 'POST') {
      const body = await request.json();
      trinityAuth = body.trinityAuth || body['.TrinityAuth'] || '';
      weekEndingDay = body.weekEndingDay || body.dt || '';
    } else {
      // GET support: ?trinityAuth=...&weekEndingDay=12/5/2025
      const url = new URL(request.url);
      trinityAuth = url.searchParams.get('trinityAuth') || url.searchParams.get('.TrinityAuth') || '';
      weekEndingDay = url.searchParams.get('weekEndingDay') || url.searchParams.get('dt') || '';
    }

    if (!trinityAuth) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing trinityAuth cookie value' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!weekEndingDay) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing weekEndingDay (e.g. 12/5/2025)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Format: the original site expects dt=12/5/2025 or mm/dd/yyyy
    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').join('/')
      : weekEndingDay;

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
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

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Timesheet proxy error:', error);
    return new NextResponse(
      `Proxy failed: ${error.message}`,
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';