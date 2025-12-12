// app/api/lms/dashboard/route.ts

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const empId = body.empId;
    const token = body.token;
    console.log("[LMS DASHBOARD] empId:", empId);
    console.log("[LMS DASHBOARD] token:", token);
    if (!empId || !token) {
      return new Response(
        JSON.stringify({ error: "empId and token required" }),
        { status: 400 }
      );
    }

    const url = `https://uiaplmsapi.azurewebsites.net/api/leave/getDashboard/${empId}`;

    console.log("[LMS DASHBOARD] URL:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "https://lms.ubtiinc.com",
        Accept: "application/json",
      },
    });
    console.log("[LMS DASHBOARD] Response Status:", response.status, response.statusText);
    const raw = await response.text();
    console.log("[LMS DASHBOARD] RAW:", raw.substring(0, 300));

    // Fix double-encoded JSON issue
    let json;
    try {
      console.log(raw);
      const first = JSON.parse(raw);
      json = typeof first === "string" ? JSON.parse(first) : first;
    } catch (err) {
      console.error("JSON parse failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid LMS response", raw }),
        { status: 500 }
      );
    }

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
