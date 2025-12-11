// app/api/login/route.ts

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

  const cookies = trinityResponse.headers.get("set-cookie") || "";
  const trinityText = await trinityResponse.text();

  let trinityJson: any = null;
  try {
    trinityJson = JSON.parse(trinityText);
  } catch {}

  if (trinityJson) {
    const isRedirectSuccess =
      typeof trinityJson.RedirectUrl === "string" &&
      trinityJson.RedirectUrl.includes("/TimetrackForms/Dashboard/Index");

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

    console.log("[LMS DEBUG] Starting authentication attempt");
    console.log("[LMS DEBUG] Username:", username);
    console.log("[LMS DEBUG] Full URL:", lmsUrl);

    try {
      const lmsResponse = await fetch(lmsUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      console.log(
        "[LMS DEBUG] Response Status:",
        lmsResponse.status,
        lmsResponse.statusText
      );
      console.log("[LMS DEBUG] Response OK:", lmsResponse.ok);

      if (!lmsResponse.ok) {
        const errorText = await lmsResponse.text();
        console.log("[LMS DEBUG] Failed Response Body:", errorText);
      } else {
        let lmsJson: any = null;
        try {
          const raw = await lmsResponse.text();
          console.log("[LMS DEBUG] RAW TEXT:", raw.substring(0, 500));

          // FIRST parse attempt
          let firstParsed = null;
          try {
            firstParsed = JSON.parse(raw);
          } catch {
            console.log("[LMS DEBUG] First JSON.parse failed");
          }

          // If parsed result is a STRING → double encoded → parse again
          if (typeof firstParsed === "string") {
            console.log(
              "[LMS DEBUG] Double-encoded JSON detected. Parsing inner JSON..."
            );
            lmsJson = JSON.parse(firstParsed);
          } else {
            lmsJson = firstParsed;
          }

          console.log("[LMS DEBUG] FINAL Parsed LMS JSON:", lmsJson);
        } catch (err) {
          console.error("[LMS DEBUG] JSON parse error:", err);
          lmsJson = null;
        }

        if (lmsJson && lmsJson.Token) {
          console.log("[LMS DEBUG] SUCCESS! Token found");
          lmsSuccess = true;
          LMStoken = lmsJson.Token;
          LMSdata = lmsJson.Data || null;
        }
      }
    } catch (err: any) {
      console.error("[LMS DEBUG] Fetch or processing error:", err.message || err);
    }
  }

  // === Final combined success ===
  const success = trinitySuccess || lmsSuccess;

  return new Response(
    JSON.stringify({
      success,
      trinitySuccess,
      lmsSuccess,
      trinityAuth: trinitySuccess ? trinityAuth : null,
      LMStoken: lmsSuccess ? LMStoken : null,
      LMSdata: lmsSuccess ? LMSdata : null,
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
