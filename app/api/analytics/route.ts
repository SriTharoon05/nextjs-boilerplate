// app/api/analytics/route.ts
import { NextResponse } from 'next/server';

const TARGET_URL = 'https://portal.ubtiinc.com/TimetrackForms/dashboard/index';

export async function POST(request: Request) {
  return handleRequest(request);
}

export async function GET(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    // 1. Get the TrinityAuth token from body (POST JSON) OR query param (GET)
    let trinityAuth = '';

    if (request.method === 'POST') {
      const body = await request.json();
      trinityAuth = body.trinityAuth || body['.TrinityAuth'] || '';
    } else {
      // GET: from ?trinityAuth=...
      const url = new URL(request.url);
      trinityAuth = url.searchParams.get('trinityAuth') || '';
    }

    if (!trinityAuth) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing trinityAuth token' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch the real dashboard with the provided cookie
    const response = await fetch(TARGET_URL, {
      method: 'GET',
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      cache: 'no-store', // always fresh
    });

    const html = await response.text();

    if (!response.ok) {
      return new NextResponse(
        `Target server error: ${response.status}\n\n${html.substring(0, 500)}`,
        { status: response.status }
      );
    }

    // Success: return the actual HTML
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Proxy error:', error);
    return new NextResponse(
      `Proxy failed: ${error.message || 'Unknown error'}`,
      { status: 500 }
    );
  }
}

// Important for POST requests from Postman
export const dynamic = 'force-dynamic';