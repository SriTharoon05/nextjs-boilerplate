// app/api/login/route.ts
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();

  const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/Login/UsernamePassword', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'X-HTTP-Method-Override': 'PUT',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
    body,
    redirect: 'manual',
  });

  const setCookie = response.headers.get('set-cookie') || '';
  const text = await response.text();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return new Response(
    JSON.stringify({
      success: json?.RedirectUrl === '/TimetrackForms/Dashboard/Index',
      cookies: setCookie,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}