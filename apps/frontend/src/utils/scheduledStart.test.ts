import { describe, expect, it } from 'vitest';

import {
  clampScheduledStart,
  nextScheduledStart,
  scheduledStartBounds,
  scheduledStartConfigFromDate,
  scheduledStartDateFromConfig,
} from './scheduledStart';

describe('scheduled start conversion', () => {
  it('keeps the calendar-day rollover when the five-minute default crosses midnight', () => {
    const now = new Date(2026, 6, 10, 23, 58, 30);
    const next = nextScheduledStart(now);

    expect(next.getDate()).toBe(11);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(5);
    expect(scheduledStartConfigFromDate(next, now)).toEqual({ hour: 0, minute: 5, nextDay: true });
  });

  it('round-trips a next-day config through one absolute Date', () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);
    const date = scheduledStartDateFromConfig({ hour: 8, minute: 30, nextDay: true }, now);

    expect(date.getDate()).toBe(11);
    expect(scheduledStartConfigFromDate(date, now)).toEqual({ hour: 8, minute: 30, nextDay: true });
  });

  it('keeps picker values inside the five-minute-to-24-hour window', () => {
    const now = new Date(2026, 6, 10, 23, 58, 20);
    const bounds = scheduledStartBounds(now);

    expect(bounds.min).toEqual(new Date(2026, 6, 11, 0, 5, 0));
    expect(bounds.max).toEqual(new Date(2026, 6, 11, 23, 55, 0));
    expect(clampScheduledStart(new Date(2026, 6, 10, 23, 55), bounds)).toEqual(bounds.min);
    expect(clampScheduledStart(new Date(2026, 6, 12, 0, 0), bounds)).toEqual(bounds.max);
  });
});
