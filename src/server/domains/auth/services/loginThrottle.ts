import ipaddr from 'ipaddr.js';
import { TooManyRequestsError } from '@/server/infra/http/errors';

const FAILURE_TTL_MS = 15 * 60 * 1000;
const SOURCE_WINDOW_MS = 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;
const MAX_CONCURRENT_VERIFICATIONS = 2;

interface Bucket {
  failures: number;
  blockedUntil: number;
  expiresAt: number;
  inFlight: number;
  windowStart: number;
  attempts: number;
}

export interface LoginAttempt {
  reserveAccount(username: string): void;
  finish(outcome?: 'success' | 'failure' | 'neutral'): void;
}

export function getLoginSource(request: Request): string {
  // Request 不提供可信 socket 地址。仅允许部署管理员显式信任代理覆盖的 X-Real-IP；
  // 缺少代理、非法 IP 或未启用信任时共用 unknown 桶，防止客户端伪造头绕过限流。
  if (process.env.AUTH_TRUST_PROXY?.trim().toLowerCase() !== 'true') return 'unknown';
  const value = request.headers.get('x-real-ip')?.trim();
  if (!value || value.length > 45 || value.includes('%') || !ipaddr.isValid(value)) return 'unknown';
  const address = ipaddr.process(value);
  // IPv4 映射 IPv6 与等价 IPv6 表示必须共享来源计数。
  return address.toString();
}

export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();
  private activeVerifications = 0;
  private nextCleanupAt = 0;

  private getBucket(key: string, now: number): Bucket {
    // 按分钟惰性清理，仅回收过期且没有在途请求的记录，不创建常驻定时器。
    if (now >= this.nextCleanupAt) {
      for (const [storedKey, bucket] of this.buckets) {
        if (bucket.inFlight === 0 && bucket.expiresAt <= now) this.buckets.delete(storedKey);
      }
      this.nextCleanupAt = now + SOURCE_WINDOW_MS;
    }
    const existing = this.buckets.get(key);
    if (existing && (existing.expiresAt > now || existing.inFlight > 0)) return existing;
    if (!existing && this.buckets.size >= MAX_TRACKED_KEYS) {
      // 容量耗尽时拒绝新键；不能通过不断换账号驱逐已有冷却记录。
      throw new TooManyRequestsError(60);
    }
    const bucket: Bucket = {
      failures: 0, blockedUntil: 0, expiresAt: now + FAILURE_TTL_MS,
      inFlight: 0, windowStart: now, attempts: 0,
    };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private checkCooldown(bucket: Bucket, now: number): void {
    if (bucket.blockedUntil > now) {
      throw new TooManyRequestsError(Math.ceil((bucket.blockedUntil - now) / 1000));
    }
  }

  private recordFailure(bucket: Bucket, threshold: number, now: number): void {
    bucket.failures++;
    if (bucket.failures >= threshold) {
      // 达到阈值后依次冷却 1、2、4…秒，上限 15 分钟；拒绝请求不延长冷却。
      const cooldownMs = Math.min(1000 * 2 ** Math.min(bucket.failures - threshold, 20), FAILURE_TTL_MS);
      bucket.blockedUntil = now + cooldownMs;
    }
    bucket.expiresAt = now + FAILURE_TTL_MS;
  }

  begin(source: string): LoginAttempt {
    const now = Date.now();
    const sourceBucket = this.getBucket(`source:${source}`, now);
    this.checkCooldown(sourceBucket, now);
    if (now - sourceBucket.windowStart >= SOURCE_WINDOW_MS) {
      sourceBucket.windowStart = now;
      sourceBucket.attempts = 0;
    }
    if (sourceBucket.attempts >= 30) {
      throw new TooManyRequestsError(Math.ceil((sourceBucket.windowStart + SOURCE_WINDOW_MS - now) / 1000));
    }
    // 读取请求体前扣除来源配额，成功、失败和无效输入都计入每分钟 30 次上限。
    sourceBucket.attempts++;
    sourceBucket.inFlight++;
    sourceBucket.expiresAt = now + FAILURE_TTL_MS;
    let accountBucket: Bucket | undefined;
    let finished = false;
    return {
      reserveAccount: (username) => {
        if (finished || accountBucket) throw new Error('登录验证名额不可重复申请');
        if (this.activeVerifications >= MAX_CONCURRENT_VERIFICATIONS) throw new TooManyRequestsError(1);
        const reservedAt = Date.now();
        // 与仓储 trim + 不区分大小写的查询对齐，换大小写或来源无法重置账号失败计数。
        const bucket = this.getBucket(`account:${username.trim().toLowerCase()}`, reservedAt);
        this.checkCooldown(bucket, reservedAt);
        if (bucket.inFlight > 0) throw new TooManyRequestsError(1);
        // 必须在第一次 await 用户查询/密码计算前同步预占，防止并发请求一起穿过门槛。
        bucket.inFlight++;
        bucket.expiresAt = reservedAt + FAILURE_TTL_MS;
        this.activeVerifications++;
        accountBucket = bucket;
      },
      finish: (outcome = 'neutral') => {
        if (finished) return;
        finished = true;
        const completedAt = Date.now();
        sourceBucket.inFlight--;
        if (outcome === 'failure') this.recordFailure(sourceBucket, 10, completedAt);
        if (accountBucket) {
          accountBucket.inFlight--;
          this.activeVerifications--;
          if (outcome === 'failure') this.recordFailure(accountBucket, 5, completedAt);
          if (outcome === 'success') {
            accountBucket.failures = 0;
            accountBucket.blockedUntil = 0;
          }
        }
        // 成功只重置账号失败状态，保留来源失败和尝试次数，避免攻击者用自己的账号洗掉配额。
      },
    };
  }
}

// 当前部署只有一个 Web 进程，实例内共享限流状态；多进程需在入口部署共享限流。
export const loginThrottle = new LoginThrottle();
