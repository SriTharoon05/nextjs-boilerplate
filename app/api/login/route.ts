// app/api/login/route.ts ← FINAL v3 – Returns Token + Employee Data + TrinityAuth

const allowedOrigins = [
  "http://localhost:5173",
  "https://sigmaunlimited.netlify.app",
];

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);

  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);
  const username = params.get("UserIdentification.Username") || "";
  const password = params.get("Password") || "";

  if (!username || !password) {
    return new Response(JSON.stringify({ success: false, error: "Missing credentials" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": isAllowed ? origin : "",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  // ==============================================
  // 1. Trinity Login
  // ==============================================
  const trinityResponse = await fetch(
    "https://portal.ubtiinc.com/TimetrackForms/Login/UsernamePassword",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: bodyText,
      redirect: "manual",
    }
  );

  const trinityCookies = trinityResponse.headers.get("set-cookie") || "";
  const trinityText = await trinityResponse.text();

  let trinityJson: any = null;
  try {
    trinityJson = JSON.parse(trinityText);
  } catch {}

  const trinitySuccess = trinityJson?.RedirectUrl?.includes("/TimetrackForms/Dashboard/Index");
  const authMatch = trinityCookies.match(/\.TrinityAuth=([A-F0-9]+);/i);
  const trinityAuth = trinitySuccess && authMatch ? authMatch[1] : null;

  // ==============================================
  // 2. UIA LMS Login + Employee Data
  // ==============================================
  let lmsToken: string | null = null;
  let employee: any = null;
  let lmsSuccess = false;

  try {
    const lmsUrl = `https://uiaplmsapi.azurewebsites.net/api/employee/getAuthenticate/${encodeURIComponent(username)},${encodeURIComponent(password)}`;

    const lmsResponse = await fetch(lmsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (lmsResponse.ok) {
      const lmsData = await lmsResponse.json();

      if (
        lmsData?.Data?.status?.[0]?.result === "success" &&
        lmsData.Token &&
        Array.isArray(lmsData.Data.data) &&
        lmsData.Data.data.length > 0
      ) {
        lmsToken = lmsData.Token;
        employee = lmsData.Data.data[0]; // This contains strFirstName, strEmpID, etc.
        lmsSuccess = true;
      }
    }
  } catch (err) {
    console.error("LMS API error:", err);
  }

  // ==============================================
  // Final Response
  // ==============================================
  const overallSuccess = trinitySuccess && lmsSuccess;

  return new Response(
    JSON.stringify({
      success: overallSuccess,

      // Trinity
      trinityAuth: trinityAuth,

      // LMS
      lmsToken: lmsToken,

      // Employee info you need for next steps
      employee: employee
        ? {
            name: employee.strFirstName?.trim(),
            role: employee.strRoleName,
            empId: employee.strEmpID,
            isChangePassword: employee.isChangePassword === 1,
          }
        : null,

      // Optional debug (remove in production if you want)
      // _debug: { trinitySuccess, lmsSuccess },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": isAllowed ? origin : "",
        "Access-Control-Allow-Credentials": "true",
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
      "Access-Control-Allow-Origin": isAllowed ? origin : "",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Requested-With,Accept",
    },
  });
}