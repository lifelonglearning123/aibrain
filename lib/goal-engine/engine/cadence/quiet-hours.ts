import { DateTime } from "luxon";

/**
 * Clamp a desired fire time into the location's local send window, with jitter.
 *
 * The planner emits `wait_hours` per step; the executor turns "now + wait_hours"
 * into a real fire time and then passes it through here so nothing ever sends
 * outside quiet hours. Blueprint §5/§8: never queue-and-blast at 9:00:00 sharp —
 * jitter 0–20 min. TCPA voice window is 8am–9pm local (Phase 3).
 */
export interface QuietWindow {
  /** Local hour the window opens (0–23). */
  startHour: number;
  /** Local hour the window closes, exclusive (0–24). */
  endHour: number;
  timezone: string;
}

export function clampToQuietHours(desired: Date, win: QuietWindow, opts?: { jitterMinutes?: number }): Date {
  const jitterMax = opts?.jitterMinutes ?? 20;
  // Deterministic-ish jitter derived from the timestamp so retries don't drift.
  const jitter = Math.floor((desired.getTime() / 60000) % (jitterMax + 1));

  let dt = DateTime.fromJSDate(desired, { zone: win.timezone });

  const openToday = dt.set({ hour: win.startHour, minute: 0, second: 0, millisecond: 0 });
  const closeToday = dt.set({ hour: win.endHour, minute: 0, second: 0, millisecond: 0 });

  if (dt < openToday) {
    dt = openToday.plus({ minutes: jitter });
  } else if (dt >= closeToday) {
    // After close → open next day.
    dt = openToday.plus({ days: 1, minutes: jitter });
  } else {
    dt = dt.plus({ minutes: jitter });
    // Jitter must not push us past close.
    if (dt >= closeToday) dt = closeToday.minus({ minutes: 1 });
  }

  return dt.toJSDate();
}

/** True if `at` falls inside the local send window (used as a pre-send guard). */
export function isWithinQuietHours(at: Date, win: QuietWindow): boolean {
  const dt = DateTime.fromJSDate(at, { zone: win.timezone });
  const h = dt.hour + dt.minute / 60;
  return h >= win.startHour && h < win.endHour;
}
