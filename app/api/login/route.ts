// app/api/login/route.ts ← FINAL, PERFECT, TESTED, DONE.

const allowedOrigins = [
  "http://localhost:5173",
  "https://sigmaunlimited.netlify.app",
];

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);

  const body = await request.text();

  const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/Login/UsernamePassword', {
    method: 'PUT', // Trinity only accepts real PUT here
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
    body,
    redirect: 'manual',
  });

  const cookies = response.headers.get('set-cookie') || '';
  const text = await response.text();



  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // If not valid JSON → login failed (returns HTML)
    return new Response(
      JSON.stringify({
        success: false,
        cookies: null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': isAllowed ? origin : '',
          'Access-Control-Allow-Credentials': 'true',
        },
      }
    );
  }

  // SUCCESS: Only when RedirectUrl contains the dashboard path
  const isSuccess = typeof json.RedirectUrl === 'string' &&
                    json.RedirectUrl.includes('/TimetrackForms/Dashboard/Index');

  // Extract only the .TrinityAuth value
  const authMatch = cookies.match(/\.TrinityAuth=([A-F0-9]+);/i);
  const authToken = authMatch ? authMatch[1] : null;

  return new Response(
    JSON.stringify({
      success: isSuccess,
      trinityAuth: isSuccess ? authToken : null,  // ← This is the only value you want
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Credentials': 'true',
      },
    }
  );  
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin : '',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Requested-With,Accept',
    },
  });
}
