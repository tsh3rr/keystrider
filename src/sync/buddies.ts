/**
 * Training buddies: types for what the database returns, and the pure rules
 * for showing it. A member's numbers are only as fresh as their last visit,
 * so numbers from an earlier week are aged here before they are shown.
 */

/** One row of `my_buddies`. */
export interface BuddyRow {
  user_id: string;
  username: string | null;
  is_me: boolean;
  is_owner: boolean;
  invite_code: string;
  week_start: string | null;
  goal_days: number | null;
  days_this_week: number | null;
  week_streak: number | null;
  met_this_week: boolean | null;
  wpm: number | null;
  cheers: number;
  cheered: boolean;
}

/** What a member shares (the `buddy_stats` row without its owner). */
export interface BuddyStats {
  week_start: string;
  goal_days: number;
  days_this_week: number;
  week_streak: number;
  met_this_week: boolean;
  wpm: number | null;
}

export interface BuddyInvite {
  /** The group owner's username, if they have one. */
  owner: string | null;
  members: number;
  full: boolean;
}

export const MAX_BUDDIES = 8;

/** A date as YYYY-MM-DD in local time, as the database's `date` columns take it. */
export function isoDate(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Monday before `week` (YYYY-MM-DD). */
export function previousWeek(week: string): string {
  const [y, m, d] = week.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d - 7).getTime());
}

export interface BuddyWeek {
  /** Null when the member has shared nothing yet. */
  goal: number | null;
  days: number;
  streak: number;
  met: boolean;
  wpm: number | null;
}

/**
 * A member's numbers as they stand in `week`. Numbers from last week still
 * carry the streak if that week's goal was met; anything older counts as a
 * fresh start.
 */
export function buddyWeek(row: BuddyRow, week: string): BuddyWeek {
  if (row.week_start === null || row.goal_days === null) return { goal: null, days: 0, streak: 0, met: false, wpm: null };
  if (row.week_start === week) {
    return { goal: row.goal_days, days: row.days_this_week ?? 0, streak: row.week_streak ?? 0, met: row.met_this_week ?? false, wpm: row.wpm };
  }
  const carried = row.week_start === previousWeek(week) && row.met_this_week ? row.week_streak ?? 0 : 0;
  return { goal: row.goal_days, days: 0, streak: carried, met: false, wpm: null };
}

// --- An invite link that arrived before the learner could act on it ---

const INVITE_KEY = 'typing-trainer.buddy-invite';
const SPEED_KEY = 'typing-trainer.buddy-speed';
export const INVITE_PARAM = 'buddy';

/** Takes `?buddy=CODE` out of the address and keeps it until it is answered. */
export function takeInviteFromUrl(): void {
  const url = new URL(location.href);
  const code = url.searchParams.get(INVITE_PARAM);
  if (!code) return;
  if (/^[0-9a-f]{12}$/i.test(code)) savePendingInvite(code.toLowerCase());
  url.searchParams.delete(INVITE_PARAM);
  history.replaceState(history.state, '', url);
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

export function savePendingInvite(code: string | null): void {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code);
    else localStorage.removeItem(INVITE_KEY);
  } catch {
    // the link can simply be opened again
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}/app/?${INVITE_PARAM}=${code}`;
}

/** Whether to share average speed with buddies; off unless turned on. */
export function loadShareSpeed(): boolean {
  try {
    return localStorage.getItem(SPEED_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveShareSpeed(on: boolean): void {
  try {
    localStorage.setItem(SPEED_KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}
