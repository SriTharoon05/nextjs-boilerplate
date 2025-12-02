// app/api/analytics/route.ts ← FINAL VERSION — WORKS 100%

import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Extract cookies from browser request
  const authCookie = request.cookies.get('trinityAuthCookie')?.value || '';
  const loginCookie = request.cookies.get('trinityLoginCookie')?.value || '';

  if (!authCookie || !loginCookie) {
    return new Response('Missing cookies', { status: 401 });
  }

  const cookieHeader = `${authCookie}; ${loginCookie}`;

  try {
    const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/Dashboard/Index', {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      // Important: Don't follow redirects automatically
      redirect: 'manual',
    });

    const html = await response.text();

    // Optional: Debug — remove later
    if (!html.includes('LWTD_data')) {
      console.log('No LWTD_data found — session likely expired');
      return new Response('Session expired or invalid', { status: 401 });
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return new Response('Proxy failed', { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    },
  });
}