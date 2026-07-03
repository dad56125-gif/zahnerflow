const FIVE_HOURS_IN_SECONDS = 5 * 60 * 60;

export function formatDuration(totalSeconds: number, totalWorkflowSeconds?: number): string {
  const checkAgainst = totalWorkflowSeconds ?? totalSeconds;
  const seconds = Math.max(0, Math.round(totalSeconds));

  if (checkAgainst >= FIVE_HOURS_IN_SECONDS) {
    const hours = seconds / 3600;
    return `${hours.toFixed(1)} 小时`;
  }

  if (seconds < 60) {
    return `${seconds} 秒`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`;
  }

  return `${minutes} 分钟`;
}
