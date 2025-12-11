// app/api/login/route.ts ← YOUR ORIGINAL CODE + LMS ADDED (NO CHANGES TO TRINITY)

const allowedOrigins = [
  "http://localhost:5173",
  "https://sigmaunlimited.netlify.app",
];

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);

  const body = await request.text();  // ← your original

  // ==============================================
  // YOUR ORIGINAL TRINITY LOGIN (UNTOUCHED)
  // ==============================================
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

  // ==============================================
  // NEW: UIA LMS LOGIN (using same username/password from body)
  // ==============================================
  let lmsToken: string | null = null;
  let employee: any = null;
  let lmsSuccess = false;

  try {
    // Extract username/password from the body you already send
    const params = new URLSearchParams(body);
    const username = params.get("UserIdentification.Username") || "";
    const password = params.get("Password") || "";

    if (!username || !password) {
      throw new Error("Missing credentials");
    }

    const lmsUrl = `https://uiaplmsapi.azurewebsites.net/api/employee/getAuthenticate/${encodeURIComponent(username)},${encodeURIComponent(password)}`;

    const lmsResponse = await fetch(lmsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (lmsResponse.ok) {
      const data = await lmsResponse.json();
      if (
        data?.Token &&
        data?.Data?.status?.[0]?.result === "success" &&
        Array.isArray(data.Data.data) &&
        data.Data.data.length > 0
      ) {
        lmsToken = data.Token;
        employee = data.Data.data[0];
        lmsSuccess = true;
      }
    }
  } catch (err) {
    console.error("LMS failed:", err);
  }

  // ==============================================
  // Final response: Your original + LMS extras
  // ==============================================
  const overallSuccess = isSuccess && lmsSuccess;

  return new Response(
    JSON.stringify({
      success: overallSuccess,
      trinityAuth: isSuccess ? authToken : null, // ← your original
      lmsToken: lmsToken || null,                // ← new
      employee: employee
        ? {
            name: (employee.strFirstName || "").trim(),
            role: employee.strRoleName,
            empId: employee.strEmpID,
            isChangePassword: employee.isChangePassword === 1,
          }
        : null,
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