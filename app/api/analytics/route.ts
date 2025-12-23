// app/api/analytics/route.ts
import { NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/dashboard/index';

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
    const { trinityAuth } = await request.json();

    if (!trinityAuth) {
      return NextResponse.json({ error: 'Missing trinityAuth token' }, { status: 400 });
    }

    // Fetch dashboard HTML
    const res = await fetch(BASE_URL, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch dashboard', status: res.status },
        { status: 502 }
      );
    }

    const html = await res.text();

    // Basic validation - check for key phrases that indicate valid dashboard
    const isValidDashboard =
      html.includes('My Status') &&
      html.includes('Weekly Approval Status') &&
      html.includes('Monthly Status') &&
      html.includes('d3.select') &&
      (html.includes('Sri Tharoon') || html.includes('user-info')); // adjust according to real names

    if (!isValidDashboard) {
      return NextResponse.json(
        {
          error: 'Invalid or expired TrinityAuth token / not a dashboard page',
          authValid: false,
        },
        { status: 401 }
      );
    }

    const prompt = `
You are an expert at extracting structured data from Trinity TimeTrack dashboard / analytics HTML pages.

Return ONLY valid JSON. No explanations, no markdown, no code fences, no comments.

Use this exact structure (all numbers should be floats where appropriate):

{
  "user": {
    "name": string,              // Full name from top right corner
    "userId": number | null      // AppUserId from links if possible
  },
  "myStatus": {
    "yearToDate": {
      "Direct": number,
      "InDirect": number,
      "OverHead": number,
      "PTO": number,
      "Holiday": number,
      "total": number
    },
    "monthToDate": {
      "Direct": number,
      "InDirect": number,
      "OverHead": number,
      "PTO": number,
      "Holiday": number,
      "total": number
    }
  },
  "weeklyApprovalStatus": {
    "weeks": [
      {
        "week": number,
        "date": "YYYY-MM-DD" | null,
        "status": "approved" | "submitted" | "notSubmitted" | "empty" | "future"
      }
    ],
    "legend": {
      "approved": string,        // hex color
      "submitted": string,
      "notSubmitted": string
    }
  },
  "ptoStatus": {
    "earnedLeave": string,
    "casualLeave": string
  },
  "monthlyStatus": [
    {
      "month": string,           // "Jun", "Jul", etc.
      "Direct": number,
      "InDirect": number,
      "OverHead": number,
      "PTO": number,
      "Holiday": number,
      "total": number
    }
  ],
  "upcomingHolidays": [
    {
      "date": "YYYY-MM-DD",
      "name": string,
      "description": string,
      "daysRemaining": number | null
    }
  ],
  "expenseStatus": {
    "entries": [
      {
        "submittedDate": string | null,
        "amount": number | null,
        "status": string | null
      }
    ]
  },
  "parseMetadata": {
    "extractedAt": string,       // ISO datetime
    "success": boolean
  }
}

HTML content to analyze:
${html.substring(0, 120000)}

Important:
- For weeklyApprovalStatus.weeks → include ALL weeks shown (both past and empty/future)
- Use "approved", "submitted", "notSubmitted", "empty" based on color and presence of link
- For monthlyStatus → aggregate/sum hours per month correctly from the d3 data push logic
- Numbers should be floats (keep decimals when present)
- If any section is missing or empty, use sensible defaults (empty array/object)
`;

    const completion = await llm.invoke(prompt);
    const content = (completion as any).content?.trim() || '';

    // Clean possible code fences/markdown
    const jsonStr = content
      .replace(/```json|```/g, '')
      .replace(/^json\s*/i, '')
      .trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
      // Add extraction timestamp
      result.parseMetadata = {
        extractedAt: new Date().toISOString(),
        success: true,
      };
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return NextResponse.json(
        {
          error: 'Failed to parse LLM response into valid JSON',
          raw: jsonStr.substring(0, 1500),
          parseError: (parseError as Error).message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';