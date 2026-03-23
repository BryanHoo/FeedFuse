import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

const DOCKER_HOST_ALIAS = 'host.docker.internal';
const RESERVED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.test', '.example', '.invalid'];

export interface SafeExternalUrlOptions {
  allowUnresolvedHostname?: boolean;
}

function isAllowedIp(ip: string, options?: { allowLoopback?: boolean }): boolean {
  if (!ipaddr.isValid(ip)) return false;
  const addr = ipaddr.parse(ip);
  const range = addr.range();
  if (range === 'unicast') return true;
  if (options?.allowLoopback && range === 'loopback') return true;
  return false;
}

function looksLikePublicHostname(hostname: string): boolean {
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

export async function isSafeExternalUrl(
  value: string,
  options?: SafeExternalUrlOptions,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname) return false;

  // Docker users may enter the host alias directly; treat it the same as localhost.
  if (hostname === DOCKER_HOST_ALIAS) {
    return true;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }
  if (hostname.endsWith('.local')) return false;
  if (hostname === '0.0.0.0') return false;

  if (ipaddr.isValid(hostname)) {
    return isAllowedIp(hostname, { allowLoopback: true });
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) return false;
    for (const record of addresses) {
      if (!isAllowedIp(record.address)) return false;
    }
    return true;
  } catch {
    // Some feed URLs are reachable via container/proxy networking even when
    // local DNS lookup fails inside Node. Let explicit callers opt into that fallback.
    return options?.allowUnresolvedHostname === true && looksLikePublicHostname(hostname);
  }
}
