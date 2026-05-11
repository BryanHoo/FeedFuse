export function resolveAiDigestRunWindow(input: {
  now: Date;
  intervalMinutes: number;
}): { windowStartAt: string; windowEndAt: string } {
  const intervalMs = Math.max(1, input.intervalMinutes) * 60 * 1000;
  const windowEndAt = input.now.toISOString();
  const windowStartAt = new Date(input.now.getTime() - intervalMs).toISOString();

  return { windowStartAt, windowEndAt };
}
