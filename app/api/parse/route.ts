
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

// Azure config from .env (recommended) or fallback
const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_INSTANCE_NAME,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
  azureOpenAIApiVersion: '2024-02-15-preview',
  temperature: 0,
});

const parser = new JsonOutputParser();
const prompt = PromptTemplate.fromTemplate(`
Extract ONLY valid JSON from this Trinity TimeTrack HTML using the exact structure below.
Never explain, never wrap in markdown.

Structure: {structure}

HTML:
{{html}}
`);

const structure = JSON.stringify({
  header: {
    member: "string",
    memberId: 0,
    weekEnding: "YYYY-MM-DD",
    startDate: "YYYY-MM-DD",
    endDate: "YYYY-MM-DD",
    isSubmitted: false,
    isApproved: false,
    isFirstWeek: false,
    isLastWeek: false,
    isPartial: false,
    isUIAPFullTimeEmployee: true,
    isFullTimeEmployee: true,
    userType: "string",
    ttHeaderId: 0,
    totalHoursLogged: 0
  },
  weekDays: [{ date: "YYYY-MM-DD", day: "string", dayNum: 0 }],
  projects: [
    {
      index: 0,
      category: "string",
      projectName: "string",
      projectId: 0,
      budgetId: 0,
      budgetAssignmentId: 0,
      billingType: "string",
      hourlyTypeName: "string",
      availableHours: 0,
      usedHours: 0,
      assignedHours: 0,
      usedAssignedDisplay: "string",
      approver: "string",
      markAsHiddenId: "string",
      isSubmitted: false,
      isApproved: false,
      monthlyUsed: 0,
      maxHrs: 0,
      dailyHours: {
        D1: 0, D1ID: 0,
        D2: 0, D2ID: 0,
        D3: 0, D3ID: 0,
        D4: 0, D4ID: 0,
        D5: 0, D5ID: 0,
        D6: 0, D6ID: 0,
        D7: 0, D7ID: 0
      },
      rowTotal: 0
    }
  ]
}, null, 2);

const chain = prompt.pipe(llm).pipe(parser);

export async function POST(request: Request) {
  try {
    const { trinityAuth, weekEndingDay } = await request.json();

    if (!trinityAuth || !weekEndingDay) {
      return NextResponse.json({ error: "Missing trinityAuth or weekEndingDay" }, { status: 400 });
    }

    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/')  // YYYY-MM-DD → DD/MM/YYYY
      : weekEndingDay.replace(/-/g, '/');

    const res = await fetch(`${BASE_URL}?dt=${formattedDate}`, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: "Trinity login failed", details: err.substring(0, 500) }, { status: 502 });
    }

    const html = await res.text();   // ← THIS WAS MISSING! (await)

    const result = await chain.invoke({
      html: html.substring(0, 120_000),
      structure,
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Parse failed:", error);
    return NextResponse.json(
      { error: "AI parsing failed", message: error.message },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';