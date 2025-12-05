// app/api/parse/route.ts
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME!,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT!,
  azureOpenAIApiVersion: '2024-02-15-preview',
  temperature: 0,
  maxTokens: 4096,
});

export async function POST(request: Request) {
  try {
    const { trinityAuth, weekEndingDay } = await request.json();

    if (!trinityAuth || !weekEndingDay) {
      return NextResponse.json({ error: 'Missing trinityAuth or weekEndingDay' }, { status: 400 });
    }

    const dateStr = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/')
      : weekEndingDay;

    const res = await fetch(`${BASE_URL}?dt=${dateStr}`, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      cache: 'no-store',
    });

    const html = await res.text();

    // Critical Fix: Detect login page by checking for known elements
    const isLoginPage = 
      html.includes('SIGN IN') || 
      html.includes('id="login-form-container"') ||
      html.includes('Can\'t access your account?') ||
      html.includes('UBTI-Logo-300dpi.png') ||
      html.includes('/TimetrackForms/Login/Username');

    if (isLoginPage) {
      return NextResponse.json(
        { 
          error: 'Invalid or expired TrinityAuth token', 
          authValid: false 
        },
        { status: 401 }
      );
    }

    // Optional: Also check if it's not a timesheet (e.g. no project table, no dates, etc.)
    // But the above login checks are sufficient and reliable

    const prompt = `
You are an expert at extracting Trinity TimeTrack timesheets.
Return ONLY valid JSON with this exact structure. No explanations, no markdown.

{
  "header": {
    "member": "string",
    "memberId": number,
    "weekEnding": "2025-12-05",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "isSubmitted": boolean,
    "isApproved": boolean,
    "isFirstWeek": boolean,
    "isLastWeek": boolean,
    "isPartial": boolean,
    "isUIAPFullTimeEmployee": boolean,
    "isFullTimeEmployee": boolean,
    "userType": "string",
    "ttHeaderId": number,
    "totalHoursLogged": number
  },
  "weekDays": [{ "date": "YYYY-MM-DD", "day": "string", "dayNum": number }],
  "projects": [
    {
      "index": number,
      "category": "string",
      "projectName": "string",
      "projectId": number,
      "budgetId": number,
      "budgetAssignmentId": number,
      "billingType": "string",
      "hourlyTypeName": "string",
      "availableHours": number,
      "usedHours": number,
      "assignedHours": number,
      "usedAssignedDisplay": "string",
      "approver": "string",
      "markAsHiddenId": "string",
      "isSubmitted": boolean,
      "isApproved": boolean,
      "monthlyUsed": number,
      "maxHrs": number,
      "dailyHours": {
        "D1": number, "D1ID": number,
        "D2": number, "D2ID": number,
        "D3": number, "D3ID": number,
        "D4": number, "D4ID": number,
        "D5": number, "D5ID": number,
        "D6": number, "D6ID": number,
        "D7": number, "D7ID": number
      },
      "rowTotal": number
    }
  ]
}

HTML:
${html.substring(0, 100000)}
`;

    const completion = await llm.invoke(prompt);
    const content = (completion as any).content?.trim() || '';

    const jsonStr = content.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      return NextResponse.json(
        { 
          error: 'Failed to parse timesheet data from response',
          raw: jsonStr.substring(0, 1000)
        },
        { status: 500 }
      );
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';