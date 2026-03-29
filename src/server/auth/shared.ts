import { timingSafeEqual } from 'node:crypto';

export const AUTH_INITIAL_PASSWORD_SETUP_MESSAGE =
  '请先在环境变量中配置 AUTH_INITIAL_PASSWORD';

export function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
