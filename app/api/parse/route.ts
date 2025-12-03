// app/api/parse/route.ts   ← FINAL WORKING VERSION (tested live)
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME || 'voiceagentdemo-resource',
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
  azureOpenAIApiVersion: '2024-02-15-preview',
  temperature: 0,
  timeout: 60000,
});

const parser = new JsonOutputParser();

const prompt = PromptTemplate.fromTemplate(`
You are an expert at parsing Trinity TimeTrack HTML.
Extract and return ONLY valid JSON using this exact structure. No extra text.

{structure}

HTML (first 100k chars):
{html}
`);

const structure = `{
  "header": {
    "member": "Sri Tharoon A.S",
    "memberId": 1641,
    "weekEnding": "2025-12-05",
    "startDate": "2025-11-29",
    "endDate": "2025-12-05",
    "isSubmitted": false,
    "isApproved": false,
    "isFirstWeek": false,
    "isLastWeek": false,
    "isPartial": false,
    "isUIAPFullTimeEmployee": true,
    "isFullTimeEmployee": true,
    "userType": "FTEMP",
    "ttHeaderId": 64313,
    "totalHoursLogged": 0
  },
  "weekDays": [
    { "date": "2025-11-29", "day": "Sat", "dayNum": 29 },
    { "date": "2025-11-30", "day": "Sun", "dayNum": 30 },
    { "date": "2025-12-01", "day": "Mon", "dayNum": 1 },
    { "date": "2025-12-02", "day": "Tue", "dayNum": 2 },
    { "date": "2025-12-03", "day": "Wed", "dayNum": 3 },
    { "date": "2025-12-04", "day": "Thu", "dayNum": 4 },
    { "date": "2025-12-05", "day": "Fri", "dayNum": 5 }
  ],
  "projects": [
    {
      "index": 0,
      "category": "In-Direct",
      "projectName": "string",
      "projectId": 1023,
      "budgetId": 2258,
      "budgetAssignmentId": 22138,
      "billingType": "Absolute",
      "hourlyTypeName": "Absolute",
      "availableHours": 0,
      "usedHours": 168,
      "assignedHours": 168,
      "usedAssignedDisplay": "168.00 / 168.00",
      "approver": "Panneerselvi",
      "markAsHiddenId": "1023-2258",
      "isSubmitted": false,
      "isApproved": false,
      "monthlyUsed": 0,
      "maxHrs": 0,
      "dailyHours": {
        "D1": 0, "D1ID": 0,
        "D2": 0, "D2ID": 0,
        "D3": 0, "D3ID": 0,
        "D4": 0, "D4ID": 0,
        "D5": 0, "D5ID": 0,
        "D6": 0, "D6ID": 0,
        "D7": 0, "D7ID": 0
      },
      "rowTotal": 0
    }
  ]
}`;

const chain = prompt.pipe(llm).pipe(parser);

export async function POST(request: Request) {
  try {
    const { trinityAuth, weekEndingDay } = await request.json();

    if (!trinityAuth || !weekEndingDay) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const dateStr = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/')
      : weekEndingDay;

    const res = await fetch(`${BASE_URL}?dt=${dateStr}`, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Invalid TrinityAuth" }, { status: 401 });
    }

    const html = await res.text();

    const result = await chain.invoke({
      html: html.slice(0, 100000),
      structure,
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("AI parse failed:", error);
    return NextResponse.json({ error: "Server error", details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';