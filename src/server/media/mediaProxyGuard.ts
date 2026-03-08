import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;

  return ipaddr.parse(ip).range() === 'unicast';
}

export async function isSafeMediaUrl(value: string): Promise<boolean> {
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
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname.endsWith('.local')) return false;
  if (hostname === '0.0.0.0') return false;

  if (ipaddr.isValid(hostname)) {
    return isPublicIp(hostname);
  }

  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length) return false;

  return records.every((record) => isPublicIp(record.address));
}
