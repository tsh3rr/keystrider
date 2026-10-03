import { describe, expect, it } from 'vitest';
import { buddyWeek, isoDate, previousWeek, type BuddyRow } from './buddies';

const row = (over: Partial<BuddyRow>): BuddyRow => ({
  user_id: 'u', username: 'anna', is_me: false, is_owner: false, invite_code: '0123456789ab',
  week_start: '2026-09-28', goal_days: 4, days_this_week: 3, week_streak: 2, met_this_week: false, wpm: 41,
  cheers: 0, cheered: false, ...over,
});

describe('buddy weeks', () => {
  it('formats local dates and steps back a week across a month end', () => {
    expect(isoDate(new Date(2026, 9, 5, 23, 30).getTime())).toBe('2026-10-05');
    expect(previousWeek('2026-10-05')).toBe('2026-09-28');
  });

  it('shows this week as shared', () => {
    expect(buddyWeek(row({}), '2026-09-28')).toEqual({ goal: 4, days: 3, streak: 2, met: false, wpm: 41 });
  });

  it('carries the streak from last week only if that week was met', () => {
    expect(buddyWeek(row({ met_this_week: true, week_streak: 5 }), '2026-10-05')).toEqual({ goal: 4, days: 0, streak: 5, met: false, wpm: null });
    expect(buddyWeek(row({ met_this_week: false }), '2026-10-05').streak).toBe(0);
    expect(buddyWeek(row({ met_this_week: true }), '2026-10-12').streak).toBe(0);
  });

  it('handles a member who has shared nothing yet', () => {
    expect(buddyWeek(row({ week_start: null, goal_days: null }), '2026-09-28')).toMatchObject({ goal: null, days: 0, streak: 0 });
  });
});
