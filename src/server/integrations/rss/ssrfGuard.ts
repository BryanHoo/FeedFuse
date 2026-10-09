import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { getRssNetworkConfig, type RssNetworkConfig } from '@/server/infra/env';

const DOCKER_HOST_ALIAS = 'host.docker.internal';
const RESERVED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.test', '.example', '.invalid'];
const FAKE_IP_BENCHMARK_CIDR_BASE = ipaddr.parse('198.18.0.0');
const FAKE_IP_BENCHMARK_CIDR_PREFIX = 15;
const RFC1918_PRIVATE_CIDRS = [
  ipaddr.parseCIDR('10.0.0.0/8'),
  ipaddr.parseCIDR('172.16.0.0/12'),
  ipaddr.parseCIDR('192.168.0.0/16'),
] as const;

export interface SafeExternalUrlOptions {
  allowUnresolvedHostname?: boolean;
}

export type UnsafeExternalUrlReason =
  | 'invalid_url'
  | 'unsupported_protocol'
  | 'credentials'
  | 'missing_hostname'
  | 'local_hostname'
  | 'zero_address'
  | 'fake_ip'
  | 'private_ip'
  | 'loopback_ip'
  | 'unsafe_ip'
  | 'unresolved_hostname';

export type ExternalUrlSafetyResult =
  | { safe: true }
  | {
      safe: false;
      reason: UnsafeExternalUrlReason;
      address?: string;
      mode?: RssNetworkConfig['mode'];
    };

// 将安全阻断原因转成用户能直接处理的 RSS 拉取提示。
export function formatExternalUrlSafetyMessage(
  safety: ExternalUrlSafetyResult,
  target: 'source' | 'redirect' = 'source',
): string {
  if (safety.safe) return '当前网络环境不允许访问该链接';

  const prefix = target === 'redirect' ? 'RSS 源重定向后的地址' : '该 RSS 链接';
  const mode = safety.mode ?? 'public';
  const address = safety.address ? ` ${safety.address}` : '';

  switch (safety.reason) {
    case 'fake_ip':
      return `当前 DNS 将域名解析到 fake-ip 地址${address}，但 RSS_NETWORK_MODE 仍是 ${mode}。请改为 RSS_NETWORK_MODE=fake-ip 后重试。`;
    case 'private_ip':
      return `${prefix}解析到内网地址${address}，当前 RSS_NETWORK_MODE=${mode} 不允许访问内网源。`;
    case 'loopback_ip':
      return `${prefix}解析到本机回环地址${address}，为避免访问服务内部地址，已阻止拉取。`;
    case 'local_hostname':
      return `${prefix}使用 .local 本地域名，当前 RSS_NETWORK_MODE=${mode} 不允许访问本地域名。`;
    case 'zero_address':
      return `${prefix}指向 0.0.0.0，无法作为 RSS 源访问。`;
    case 'credentials':
      return `${prefix}包含用户名或密码，出于安全原因不允许拉取。`;
    case 'unsupported_protocol':
      return `${prefix}不是 http 或 https 链接，无法作为 RSS 源拉取。`;
    case 'unresolved_hostname':
      return `${prefix}域名无法解析，请检查 DNS 或网络代理设置。`;
    case 'invalid_url':
    case 'missing_hostname':
      return '链接格式不正确，无法识别 RSS 源地址。';
    case 'unsafe_ip':
      return `${prefix}解析到受限地址${address}，当前 RSS_NETWORK_MODE=${mode} 不允许访问。`;
  }
}

function getNetworkConfig(): RssNetworkConfig {
  return getRssNetworkConfig(process.env as Record<string, unknown>);
}

function isBenchmarkTestingIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.kind() === 'ipv4' && addr.match(FAKE_IP_BENCHMARK_CIDR_BASE, FAKE_IP_BENCHMARK_CIDR_PREFIX);
}

function isPrivateLanIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.kind() === 'ipv4' && RFC1918_PRIVATE_CIDRS.some(([base, prefix]) => addr.match(base, prefix));
}

function isExplicitlyAllowedByCidrs(addr: ipaddr.IPv4 | ipaddr.IPv6, cidrs: string[]): boolean {
  for (const cidr of cidrs) {
    const [base, prefix] = ipaddr.parseCIDR(cidr);
    if (addr.kind() === base.kind() && addr.match(base, prefix)) {
      return true;
    }
  }
  return false;
}

function normalizeIpAddress(ip: string): ipaddr.IPv4 | ipaddr.IPv6 {
  const addr = ipaddr.process(ip);
  if (addr.kind() === 'ipv6' && addr.range() === 'rfc6145') {
    // IPv4-translated 地址的末 32 位仍应按真实 IPv4 网段执行安全策略。
    return ipaddr.fromByteArray(addr.toByteArray().slice(-4));
  }
  return addr;
}

function getIpSafety(ip: string): ExternalUrlSafetyResult {
  if (!ipaddr.isValid(ip)) return { safe: false, reason: 'unsafe_ip' };
  const addr = normalizeIpAddress(ip);
  const range = addr.range();
  const config = getNetworkConfig();
  if (range === 'unicast') return { safe: true };
  // 本地部署常见 fake-ip 会落到 198.18.0.0/15，这里只做定向兼容。
  if (range === 'reserved' && config.mode === 'fake-ip' && isBenchmarkTestingIp(addr)) {
    return { safe: true };
  }
  if (config.mode === 'lan' && isPrivateLanIp(addr)) {
    return { safe: true };
  }
  if (config.mode === 'custom' && isExplicitlyAllowedByCidrs(addr, config.allowedCidrs)) {
    return { safe: true };
  }
  if (range === 'reserved' && isBenchmarkTestingIp(addr)) {
    return { safe: false, reason: 'fake_ip', address: ip, mode: config.mode };
  }
  if (isPrivateLanIp(addr)) {
    return { safe: false, reason: 'private_ip', address: ip, mode: config.mode };
  }
  if (range === 'loopback') {
    return { safe: false, reason: 'loopback_ip', address: ip, mode: config.mode };
  }
  return { safe: false, reason: 'unsafe_ip', address: ip, mode: config.mode };
}

// HTTP 连接必须使用本次已校验的 DNS 结果，不能在 URL 预检后交给系统再次解析。
// 同时校验全部候选地址，避免 Node 的 IPv4/IPv6 自动回退连接到受限地址。
export const safeExternalDnsLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { ...options, all: true }).then((addresses) => {
    if (!addresses.length) {
      throw Object.assign(new Error('Hostname did not resolve'), { code: 'ENOTFOUND' });
    }
    if (addresses.some(({ address }) => !getIpSafety(address).safe)) {
      throw new Error('Unsafe URL');
    }
    return addresses;
  }).then((addresses) => {
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  }, (error: NodeJS.ErrnoException) => callback(error, ''));
};

function looksLikePublicHostname(hostname: string): boolean {
  if (hostname === DOCKER_HOST_ALIAS) return false;
  if (!hostname.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return false;

  const labels = hostname.split('.');
  if (
    labels.some((label) => label.length === 0 || label.startsWith('-') || label.endsWith('-'))
  ) {
    return false;
  }

  return !RESERVED_HOSTNAME_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

export async function getExternalUrlSafety(
  value: string,
  options?: SafeExternalUrlOptions,
): Promise<ExternalUrlSafetyResult> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { safe: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { safe: false, reason: 'unsupported_protocol' };
  }
  if (url.username || url.password) return { safe: false, reason: 'credentials' };

  // URL 的 IPv6 hostname 带方括号；域名末尾的根标签不应改变安全判断。
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const config = getNetworkConfig();
  if (!hostname) return { safe: false, reason: 'missing_hostname' };

  // localhost 和 Docker 宿主机别名必须继续解析，按实际 IP 与管理员 CIDR 配置判断。
  // `.local` 通常用于 mDNS，本地部署在 lan/custom 模式下需要继续解析后按 IP 策略判断。
  if (hostname.endsWith('.local') && config.mode === 'public') {
    return { safe: false, reason: 'local_hostname', mode: config.mode };
  }
  if (hostname === '0.0.0.0') return { safe: false, reason: 'zero_address' };

  if (ipaddr.isValid(hostname)) {
    return getIpSafety(hostname);
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) return { safe: false, reason: 'unresolved_hostname' };
    for (const record of addresses) {
      const safety = getIpSafety(record.address);
      if (!safety.safe) return safety;
    }
    return { safe: true };
  } catch {
    // Some feed URLs are reachable via container/proxy networking even when
    // local DNS lookup fails inside Node. Let explicit callers opt into that fallback.
    if (options?.allowUnresolvedHostname === true && looksLikePublicHostname(hostname)) {
      return { safe: true };
    }
    return { safe: false, reason: 'unresolved_hostname' };
  }
}

export async function isSafeExternalUrl(
  value: string,
  options?: SafeExternalUrlOptions,
): Promise<boolean> {
  return (await getExternalUrlSafety(value, options)).safe;
}
