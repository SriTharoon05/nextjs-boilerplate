// app/api/timesheet/route.ts
import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';

const BASE_URL = 'https://portal.ubtiinc.com/TimetrackForms/TimeTrack/TimeTrackEntry';

export async function POST(request: Request) {
  try {
    const { trinityAuth, weekEndingDay } = await request.json();

    if (!trinityAuth || !weekEndingDay)
      return NextResponse.json({ error: 'Missing trinityAuth or weekEndingDay' }, { status: 400 });

    const dt = normalizeDate(weekEndingDay);
    if (!dt) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });

    const res = await fetch(`${BASE_URL}?dt=${encodeURIComponent(dt)}`, {
      headers: {
        Cookie: `.TrinityAuth=${trinityAuth}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://portal.ubtiinc.com/',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: 'Authentication failed or week not found', preview: text.slice(0, 300) }, { status: 401 });
    }

    const html = await res.text();
    return NextResponse.json(parseTimesheetHtml(html));

  } catch (error: any) {
    return NextResponse.json({ error: 'Server error', message: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ────────────────────── EXACT FORMAT YOU WANT ──────────────────────
function parseTimesheetHtml(html: string): any {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const memberName = doc.querySelector('#lblMemberName')?.textContent?.trim() || '';
  const weekEnding = doc.querySelector('#hdnWeekEnding')?.getAttribute('value') || '';
  const ttHeaderId = Number(doc.querySelector('#hdnTTHeaderID')?.getAttribute('value') || 0);
  const memberIdMatch = html.match(/MemberID[^0-9]*(\d+)/);
  const memberId = memberIdMatch ? Number(memberIdMatch[1]) : 0;

  // Week days — exactly in order: Sat → Fri
  const weekDays = [];
  const baseDate = new Date(weekEnding);
  const dayHeaders = doc.querySelectorAll('#tblWeekDays th');
  for (let i = 1; i <= 7; i++) {
    const th = dayHeaders[i];
    const text = th?.textContent?.trim() || '';
    const match = text.match(/(\w{3})\s+(\d+)/);
    if (match) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() - (7 - i));
      weekDays.push({
        date: date.toISOString().split('T')[0],
        day: match[1],
        dayNum: Number(match[2]),
      });
    }
  }

  const projects: any[] = [];
  doc.querySelectorAll('#gvTimeTrack tr').forEach((row: any, index: number) => {
    if (row.cells.length < 8) return;

    const category = row.querySelector('span')?.textContent?.trim() || '';
    const projectName = row.cells[0].textContent?.trim().replace(category, '').trim() || '';

    let projectId = 0, budgetId = 0, budgetAssignmentId = 0, markAsHiddenId = '';
    row.querySelectorAll('input[type="hidden"]').forEach((inp: HTMLInputElement) => {
      const name = inp.name || '';
      const val = inp.value || '';
      if (name.includes('ProjectID')) projectId = Number(val);
      if (name.includes('BudgetID')) budgetId = Number(val);
      if (name.includes('TTBudgetAssignmentID')) budgetAssignmentId = Number(val);
      if (name.includes('hdnMarkAsHidden')) markAsHiddenId = val;
    });

    const usedAssignedText = row.cells[row.cells.length - 2].textContent?.trim() || '0 / 0';
    const [usedStr = '0', assignedStr = '0'] = usedAssignedText.split('/').map((s: string) => s.replace(/[^\d.]/g, '').trim());
    const usedHours = parseFloat(usedStr);
    const assignedHours = parseFloat(assignedStr);
    const availableHours = Math.max(0, assignedHours - usedHours);

    const approver = row.cells[row.cells.length - 3].textContent?.trim() || '';

    const dailyInputs = row.querySelectorAll('input[type="text"]');
    const dailyHours: any = {};
    dailyInputs.forEach((inp: HTMLInputElement, i: number) => {
      const day = `D${i + 1}`;
      const val = inp.value || '0';
      dailyHours[day] = parseFloat(val) || 0;
      const idMatch = inp.id?.match(/_(\d+)$/);
      dailyHours[day + 'ID'] = idMatch ? Number(idMatch[1]) : 0;
    });

    const rowTotal = Object.keys(dailyHours)
      .filter(k => k.startsWith('D') && !k.endsWith('ID'))
      .reduce((sum: number, k: string) => sum + dailyHours[k], 0);

    projects.push({
      index,
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
      maxHrs: 0.00,
      dailyHours,
      rowTotal: Number(rowTotal.toFixed(2)),
    });
  });

  const totalHoursLogged = projects.reduce((sum, p) => sum + p.rowTotal, 0);

  return {
    header: {
      member: memberName,
      memberId,
      weekEnding,
      startDate: weekDays[0]?.date || '',
      endDate: weekDays[6]?.date || '',
      isSubmitted: false,
      isApproved: false,
      isFirstWeek: false,
      isLastWeek: false,
      isPartial: false,
      isUIAPFullTimeEmployee: true,
      isFullTimeEmployee: true,
      userType: 'FTEMP',
      ttHeaderId,
      totalHoursLogged: Number(totalHoursLogged.toFixed(2)),
    },
    weekDays,
    projects,
  };
}

function normalizeDate(dateStr: string): string | null {
  const parts = dateStr.replace(/[-.]/g, '/').split('/');
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map(Number);
  if (a > 31) return `${b}/${a}/${c}`; // dd/mm/yyyy → mm/dd/yyyy
  return `${b}/${a}/${c}`;
}