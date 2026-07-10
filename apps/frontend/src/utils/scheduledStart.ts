export interface ScheduledStartConfig {
  hour: number;
  minute: number;
  nextDay: boolean;
}

const startOfDay = (value: Date): Date => {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
};

export interface ScheduledStartBounds {
  min: Date;
  max: Date;
}

export const nextScheduledStart = (
  now: Date = new Date(),
  leadMinutes = 5,
  stepMinutes = 5,
): Date => {
  const result = new Date(now);
  result.setSeconds(0, 0);
  result.setMinutes(result.getMinutes() + leadMinutes);
  const remainder = result.getMinutes() % stepMinutes;
  if (remainder !== 0) {
    result.setMinutes(result.getMinutes() + stepMinutes - remainder);
  }
  return result;
};

export const scheduledStartBounds = (
  now: Date = new Date(),
  stepMinutes = 5,
): ScheduledStartBounds => {
  const min = nextScheduledStart(now, 5, stepMinutes);
  const max = new Date(now);
  max.setDate(max.getDate() + 1);
  max.setSeconds(0, 0);
  max.setMinutes(Math.floor(max.getMinutes() / stepMinutes) * stepMinutes);
  return { min, max };
};

export const clampScheduledStart = (
  value: Date,
  bounds: ScheduledStartBounds,
): Date => {
  if (value.getTime() < bounds.min.getTime()) return new Date(bounds.min);
  if (value.getTime() > bounds.max.getTime()) return new Date(bounds.max);
  return new Date(value);
};

export const scheduledStartConfigFromDate = (
  scheduledAt: Date,
  now: Date = new Date(),
): ScheduledStartConfig => ({
  hour: scheduledAt.getHours(),
  minute: scheduledAt.getMinutes(),
  nextDay: startOfDay(scheduledAt).getTime() > startOfDay(now).getTime(),
});

export const scheduledStartDateFromConfig = (
  config: Partial<ScheduledStartConfig>,
  now: Date = new Date(),
): Date => {
  const scheduledAt = startOfDay(now);
  if (config.nextDay) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }
  scheduledAt.setHours(
    Math.max(0, Math.min(23, Number(config.hour ?? 0))),
    Math.max(0, Math.min(59, Number(config.minute ?? 0))),
    0,
    0,
  );
  return scheduledAt;
};
