// Weekly exploration streak, derived from the local check-in history. The app used
// to show a DAILY streak (user.stats.dayStreak); the home redesign moves to a
// WEEKLY streak (did you get out and explore this week?), which is far more humane
// for a real-world exploration game — you don't have to check in every single day
// to keep momentum.

/** Monday 00:00 (local) of the week containing `d`, as epoch ms. */
function weekStartMs(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0=Sun..6=Sat. Shift so Monday is the first day of the week.
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyStreak {
  /** Consecutive weeks with at least one check-in, ending this week (or last
   *  week, so the streak isn't shown as broken before you've been out yet). */
  streakWeeks: number;
  /** Whether the current week already has a check-in. */
  thisWeekActive: boolean;
  /** Recent weeks oldest -> newest for the card's dot row; `active` = had a check-in. */
  weeks: { label: string; active: boolean }[];
}

/**
 * Compute the weekly streak from check-in timestamps.
 * @param checkIns objects with an ISO `timestamp`
 * @param now      injected for testability; defaults to the current time
 * @param recentWeeks how many weeks the dot row should cover
 */
export function computeWeeklyStreak(
  checkIns: { timestamp: string }[],
  now: Date = new Date(),
  recentWeeks = 6,
): WeeklyStreak {
  const active = new Set<number>();
  for (const c of checkIns) {
    const t = new Date(c.timestamp);
    if (!Number.isNaN(t.getTime())) active.add(weekStartMs(t));
  }

  const thisWeek = weekStartMs(now);
  const thisWeekActive = active.has(thisWeek);

  // Count consecutive active weeks. Start at this week if it's active; otherwise
  // start at last week (this week isn't over yet, so an inactive current week
  // doesn't break a streak that was alive last week).
  let cursor = thisWeekActive ? thisWeek : thisWeek - ONE_WEEK_MS;
  let streakWeeks = 0;
  while (active.has(cursor)) {
    streakWeeks += 1;
    cursor -= ONE_WEEK_MS;
  }

  // Build the recent-weeks dot row, oldest -> newest, ending at this week.
  const weeks: { label: string; active: boolean }[] = [];
  for (let i = recentWeeks - 1; i >= 0; i--) {
    const ws = thisWeek - i * ONE_WEEK_MS;
    const d = new Date(ws);
    weeks.push({
      label: i === 0 ? 'This wk' : `${d.getDate()}/${d.getMonth() + 1}`,
      active: active.has(ws),
    });
  }

  return { streakWeeks, thisWeekActive, weeks };
}
