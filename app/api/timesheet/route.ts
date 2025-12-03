// app/api/timesheet/route.ts
import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

export async function POST(request: Request) {
  return handleRequest(request);
}

export async function GET(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  try {
    let trinityAuth = '';
    let weekEndingDay = '';

    if (request.method === 'POST') {
      const body = await request.json();
      trinityAuth = body.trinityAuth || body['.TrinityAuth'] || '';
      weekEndingDay = body.weekEndingDay || body.dt || '';
    } else {
      const url = new URL(request.url);
      trinityAuth = url.searchParams.get('trinityAuth') || '';
      weekEndingDay = url.searchParams.get('weekEndingDay') || '';
    }

    if (!trinityAuth) return NextResponse.json({ error: 'Missing trinityAuth' }, { status: 400 });
    if (!weekEndingDay) return NextResponse.json({ error: 'Missing weekEndingDay' }, { status: 400 });

    const dt = normalizeDate(weekEndingDay);
    if (!dt) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });

    const targetUrl = `${BASE_URL}?dt=${encodeURIComponent(dt)}`;

    const response = await fetch(targetUrl, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://portal.ubtiinc.com/',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Portal error', status: response.status, preview: text.slice(0, 300) },
        { status: 401 }
      );
    }

    const html = await response.text();
    const data = parseTimesheetHtml(html);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error: any) {
    console.error('Timesheet API Error:', error);
    return NextResponse.json({ error: 'Server error', message: error.message }, { status: 500 });
  }
}

// ────────────────── Helper Functions (fully typed) ──────────────────

function normalizeDate(dateStr: string): string | null {
  const cleaned = dateStr.replace(/[-.]/g, '/');
  const parts = cleaned.split('/');

  if (parts.length !== 3) return null;

  // Handle dd/mm/yyyy → mm/dd/yyyy (most common in your case)
  const [d, m, y] = parts.map(Number);
  if (d > 31) return `${m}/${d}/${y}`;           // dd/mm/yyyy
  if (y.toString().length === 4) return `${m}/${d}/${y}`; // mm/dd/yyyy or yyyy/mm/dd
  return cleaned;
}

interface WeekDay {
  date: string;
  day: string;
  dayNum: number;
}

interface DailyHours {
  [key: string]: number;
}

interface Project {
  index: number;
  category: string;
  projectName: string;
  projectId: number;
  budgetId: number;
  budgetAssignmentId: number;
  billingType: string;
  hourlyTypeName: string;
  availableHours: number;
  usedHours: number;
  assignedHours: number;
  usedAssignedDisplay: string;
  approver: string;
  markAsHiddenId: string;
  isSubmitted: boolean;
  isApproved: boolean;
  monthlyUsed: number;
  maxHrs: number;
  dailyHours: DailyHours;
  rowTotal: number;
}

function parseTimesheetHtml(html: string): any {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const memberName = doc.querySelector('#lblMemberName')?.textContent?.trim() ?? 'Unknown User';
  const weekEnding = doc.querySelector('#hdnWeekEnding')?.getAttribute('value') ?? '';
  const ttHeaderId = Number(doc.querySelector('#hdnTTHeaderID')?.getAttribute('value') ?? '0');

  // Week days
  const weekDays: WeekDay[] = [];
  const dayHeaders = doc.querySelectorAll('#tblWeekDays th');
  const baseDate = new Date(weekEnding);

  for (let i = 1; i < dayHeaders.length; i++) {
    const th = dayHeaders[i] as HTMLElement;
    const text = th.textContent?.trim() ?? '';
    const match = text.match(/(\w{3})\s+(\d+)/);
    if (match) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + (i - 6)); // Friday = index 6
      weekDays.push({
        date: date.toISOString().split('T')[0],
        day: match[1],
        dayNum: Number(match[2]),
      });
    }
  }

  // Projects
  const projects: Project[] = [];
  const rows = doc.querySelectorAll('#gvTimeTrack tr');

  rows.forEach((row: any, idx: number) => {
    if ((row as HTMLTableRowElement).cells.length < 5) return;

    const category = (row.querySelector('span') as HTMLSpanElement)?.textContent?.trim() ?? '';
    const fullText = (row.cells[0] as HTMLTableCellElement).textContent ?? '';
    const projectName = fullText.replace(category, '').trim();

    // Hidden inputs
    let projectId = 0, budgetId = 0, budgetAssignmentId = 0, markAsHiddenId = '';
    const hiddenInputs = row.querySelectorAll('input[type="hidden"]');
    hiddenInputs.forEach((inp: HTMLInputElement) => {
      const name = inp.name ?? '';
      const val = inp.value ?? '';
      if (name.includes('ProjectID')) projectId = Number(val);
      if (name.includes('BudgetID')) budgetId = Number(val);
      if (name.includes('TTBudgetAssignmentID')) budgetAssignmentId = Number(val);
      if (name.includes('hdnMarkAsHidden')) markAsHiddenId = val;
    });

    // Used / Assigned
    const usedAssignedCell = row.cells[row.cells.length - 2] as HTMLTableCellElement;
    const usedAssignedText = usedAssignedCell?.textContent?.trim() ?? '0 / 0';
    const [usedStr = '0', assignedStr = '0'] = usedAssignedText.split('/').map((s: string) => s.replace(/[^\d.]/g, '').trim());
    const usedHours = parseFloat(usedStr);
    const assignedHours = parseFloat(assignedStr);
    const availableHours = Math.max(0, assignedHours - usedHours);

    const approver = (row.cells[row.cells.length - 3] as HTMLTableCellElement)?.textContent?.trim() ?? '';

    // Daily hours
    const dailyHours: DailyHours = {};
    const textInputs = row.querySelectorAll('input[type="text"]');
    textInputs.forEach((inp: HTMLInputElement, i: number) => {
      const dayKey = `D${i + 1}`;
      const value = inp.value || '0';
      dailyHours[dayKey] = parseFloat(value) || 0;
      const idMatch = inp.id?.match(/_(\d+)$/);
      dailyHours[dayKey + 'ID'] = idMatch ? Number(idMatch[1]) : 0;
    });

    const rowTotal = Object.keys(dailyHours)
      .filter(k => k.startsWith('D') && !k.endsWith('ID'))
      .reduce((sum, k) => sum + dailyHours[k], 0);

    projects.push({
      index: idx,
      category,
      projectName,
      projectId,
      budgetId,
      budgetAssignmentId,
      billingType: 'Absolute',
      hourlyTypeName: 'Absolute',
      availableHours,
      usedHours,
      assignedHours,
      usedAssignedDisplay: `${usedHours.toFixed(2)} / ${assignedHours.toFixed(2)}`,
      approver,
      markAsHiddenId,
      isSubmitted: false,
      isApproved: false,
      monthlyUsed: 0,
      maxHrs: 0,
      dailyHours,
      rowTotal: Number(rowTotal.toFixed(2)),
    });
  });

  const totalHoursLogged = projects.reduce((sum, p) => sum + p.rowTotal, 0);

  return {
    header: {
      member: memberName,
      memberId: Number(html.match(/MemberID[^0-9]*(\d+)/)?.[1] ?? '0'),
      weekEnding,
      startDate: weekDays[0]?.date ?? '',
      endDate: weekDays[6]?.date ?? '',
      ttHeaderId,
      totalHoursLogged: Number(totalHoursLogged.toFixed(2)),
      isSubmitted: false,
      isApproved: false,
      isFullTimeEmployee: true,
      userType: 'FTEMP',
    },
    weekDays,
    projects,
  };
}

export const dynamic = 'force-dynamic';