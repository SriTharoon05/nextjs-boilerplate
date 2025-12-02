// api/login.ts
import type { NextRequest } from 'next/server';

export const config = {
  api: {
    bodyParser: false, // we need raw body
  },
};

export default async function handler(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.text();

    const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/Login/UsernamePassword', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-HTTP-Method-Override': 'PUT',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      body: body,
      redirect: 'manual',
    });

    const setCookie = response.headers.get('set-cookie') || '';
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return new Response(
      JSON.stringify({
        success: json?.RedirectUrl === '/TimetrackForms/Dashboard/Index',
        redirectUrl: json?.RedirectUrl || null,
        cookies: setCookie,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}