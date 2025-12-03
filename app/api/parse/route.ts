// app/api/parse/route.ts → POST /api/parse
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

// This works 100% on Vercel + Azure
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

    // Format date: 2025-12-05 → 05/12/2025
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

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: 'Invalid TrinityAuth', details: text.substring(0, 300) }, { status: 401 });
    }

    const html = await res.text();

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

    // Clean ```json wrappers
    const jsonStr = content.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      return NextResponse.json({ error: 'Failed to parse JSON', raw: jsonStr }, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Server error', message: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';