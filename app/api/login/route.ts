// app/api/login/route.ts  ← 100% WORKING FINAL VERSION

export async function POST(request: Request) {
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
  try { json = JSON.parse(text); } catch {}

  const isSuccess = json?.RedirectUrl === '/TimetrackForms/Dashboard/Index';

  return new Response(JSON.stringify({
    success: isSuccess,
    cookies: setCookie,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:5173',  // ← EXACT ORIGIN
      'Access-Control-Allow-Credentials': 'true',             // ← REQUIRED
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}