// app/api/analytics/route.ts ← NEW FILE

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  
  // Forward the cookies to Trinity
  const response = await fetch('https://portal.ubtiinc.com/TimetrackForms/Dashboard/Index', {
    method: 'GET',
    headers: {
      'Cookie': cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0',
    },
    redirect: 'manual',
  });

  const html = await response.text();

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Cookie, Content-Type',
    },
  });
}