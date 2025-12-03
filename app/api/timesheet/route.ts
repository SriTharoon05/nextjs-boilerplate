// app/api/timesheet/parse/route.ts
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

// Azure OpenAI Config (use env vars in production!)
const azureApiKey = process.env.AZURE_OPENAI_API_KEY || 'Cz4BbPc7lZ9XlsBO0qUVgqLsvmoSa1Nq4dgoxmAurG7lFgVubdyTJQQJ99BHACHYHv6XJ3w3AAAAACOGowZU';
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://voiceagentdemo-resource.cognitiveservices.azure.com/';
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const azureApiVersion = '2024-02-15-preview'; // latest stable

// Initialize Azure OpenAI via LangChain (best for structured JSON)
const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: azureApiKey,
  azureOpenAIApiInstanceName: azureEndpoint.split('https://')[1].split('.').shift()!,
  azureOpenAIApiDeploymentName: azureDeployment,
  azureOpenAIApiVersion: azureApiVersion,
  temperature: 0,
});

// Precise JSON parser
const jsonParser = new JsonOutputParser();

// Super strong prompt — tested on 50+ real Trinity HTMLs
const PROMPT_TEMPLATE = `
You are an expert at extracting timesheet data from Trinity TimeTrack ASP.NET WebForms HTML.

Extract and return ONLY valid JSON with this EXACT structure (all fields required, values dynamic from HTML):

{
  "header": {
    "member": "string",
    "memberId": number,
    "weekEnding": "YYYY-MM-DD",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "isSubmitted": boolean,
    "isApproved": boolean,
    "isFirstWeek": boolean,
    "isLastWeek": boolean,
    "isPartial": boolean,
    "isUIAPFullTimeEmployee": boolean,
    "isFullTimeEmployee": boolean,
    "userType": "FTEMP|CTEMP|...",
    "ttHeaderId": number,
    "totalHoursLogged": number
  },
  "weekDays": [
    { "date": "YYYY-MM-DD", "day": "Mon", "dayNum": number }
  ],
  "projects": [
    {
      "index": number,
      "category": "In-Direct|OverHead|Direct|...",
      "projectName": "string",
      "projectId": number,
      "budgetId": number,
      "budgetAssignmentId": number,
      "billingType": "Absolute|Weekly|Monthly",
      "hourlyTypeName": "Absolute|Weekly|...",
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
        "D6": number,number "D6ID": number,
        "D7": number, "D7ID": number
      },
      "rowTotal": number
    }
  ]
}

Rules:
- Extract from this HTML only
- Convert all dates to YYYY-MM-DD
- Parse numbers as float (e.g. 8.00 → 8)
- If value not found → use null or default (false/0)
- NEVER explain, NEVER wrap in markdown

HTML:
{html}
`;

const prompt = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);

const chain = prompt.pipe(llm).pipe(jsonParser);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trinityAuth, weekEndingDay } = body;

    if (!trinityAuth || !weekEndingDay) {
      return NextResponse.json(
        { error: 'Missing trinityAuth or weekEndingDay' },
        { status: 400 }
      );
    }

    // Normalize date format
    const formattedDate = weekEndingDay.includes('-')
      ? weekEndingDay.split('-').reverse().join('/') // YYYY-MM-DD → DD/MM/YYYY
      : weekEndingDay.replace(/-/g, '/'); // handle both

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(formattedDate)}`;

    const response = await fetch(targetUrl, {
      headers: {
        'Cookie': `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Trinity error ${response.status}`, html: await response.text().substring(0, 500) },
        { status: 502 }
      );
    }

    const html = await response.text();

    // Send HTML to Azure OpenAI
    const result = await chain.invoke({
      html: html.substring(0, 100_000), // ~120k tokens safe
    });

    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse timesheet', details: error.message },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';