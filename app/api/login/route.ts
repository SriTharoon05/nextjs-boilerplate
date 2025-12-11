// app/api/login/route.ts ← UPDATED VERSION (separate success flags + combined success)

const allowedOrigins = [
  "http://localhost:5173",
  "https://sigmaunlimited.netlify.app",
];

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);

  const bodyText = await request.text();

  // Parse username & password from incoming form data
  const params = new URLSearchParams(bodyText);
  const username = params.get("UserIdentification.Username") || "";
  const password = params.get("Password") || "";

  // === Step 1: Trinity Login ===
  let trinitySuccess = false;
  let trinityAuth: string | null = null;

  const trinityResponse = await fetch('https://portal.ubtiinc.com/TimetrackForms/Login/UsernamePassword', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    },
    body: bodyText,
    redirect: 'manual',
  });

  const cookies = trinityResponse.headers.get('set-cookie') || '';
  const trinityText = await trinityResponse.text();

  let trinityJson: any = null;
  try {
    trinityJson = JSON.parse(trinityText);
  } catch {}

  if (trinityJson) {
    const isRedirectSuccess = typeof trinityJson.RedirectUrl === 'string' &&
                              trinityJson.RedirectUrl.includes('/TimetrackForms/Dashboard/Index');
    const authMatch = cookies.match(/\.TrinityAuth=([A-F0-9]+);/i);
    const authToken = authMatch ? authMatch[1] : null;

    if (isRedirectSuccess && authToken) {
      trinitySuccess = true;
      trinityAuth = authToken;
    }
  }

// === Step 2: LMS Authentication ===
let lmsSuccess = false;
let LMStoken: string | null = null;
let LMSdata: any = null;

if (username && password) {
  const lmsUrl = `https://uiaplmsapi.azurewebsites.net/api/employee/getAuthenticate/${username},${password}`;

  console.log('[LMS DEBUG] Starting authentication attempt');
  console.log('[LMS DEBUG] Username:', username);
  console.log('[LMS DEBUG] Full URL:', lmsUrl);

  try {
    const lmsResponse = await fetch(lmsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log('[LMS DEBUG] Response Status:', lmsResponse.status, lmsResponse.statusText);
    console.log('[LMS DEBUG] Response OK:', lmsResponse.ok);

    if (!lmsResponse.ok) {
      const errorText = await lmsResponse.text();
      console.log('[LMS DEBUG] Failed Response Body:', errorText);
      return; // or continue
    }

    // CRITICAL: Properly parse JSON with error handling
// CRITICAL: Properly parse JSON with error handling
let lmsJson: any;
try {
  lmsJson = await lmsResponse.json();
  console.log('[LMS DEBUG] SUCCESS: JSON parsed correctly');
  console.log('[LMS DEBUG] Full Parsed JSON:', lmsJson);  // ← FIXED: no JSON.stringify here
  // Or for pretty print:
  // console.log('[LMS DEBUG] Full Parsed JSON:', JSON.stringify(lmsJson, null, 2));
} catch (parseErr: any) {
  console.error('[LMS DEBUG] JSON PARSE FAILED!');
  const rawText = await lmsResponse.text();
  console.error('[LMS DEBUG] Raw response body:', rawText.substring(0, 1000));
  console.error('[LMS DEBUG] Parse error:', parseErr.message);
  lmsJson = null;
}

if (lmsJson && typeof lmsJson === 'object' && lmsJson.Token) {
  console.log('[LMS DEBUG] SUCCESS! Token found');
  lmsSuccess = true;
  LMStoken = lmsJson.Token;
  LMSdata = lmsJson.Data || null;

  const statusResult = lmsJson?.Data?.status?.[0]?.result;
  console.log('[LMS DEBUG] LMS Status:', statusResult);
} else {
  console.log('[LMS DEBUG] FAILED - No Token in parsed JSON');
  console.log('[LMS DEBUG] lmsJson type:', typeof lmsJson);
  console.log('[LMS DEBUG] Available top-level keys:', Object.keys(lmsJson || {}));
}
  } catch (err: any) {
    console.error('[LMS DEBUG] Fetch or processing error:', err.message || err);
  }
}
  // === Final combined success ===
  const success = trinitySuccess || lmsSuccess;

  // If both failed, you may want to return early with minimal info
  // But we still return everything for frontend flexibility
  return new Response(
    JSON.stringify({
      success,                    // true if at least one succeeded
      trinitySuccess,             // ← new: true only if Trinity login worked
      lmsSuccess,                 // ← new: true only if LMS returned a token
      trinityAuth: trinitySuccess ? trinityAuth : null,
      LMStoken: lmsSuccess ? LMStoken : null,
      LMSdata: lmsSuccess ? LMSdata : null,
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