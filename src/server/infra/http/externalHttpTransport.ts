import got from 'got';
import { safeExternalDnsLookup } from '@/server/integrations/rss/ssrfGuard';

export const externalHttpTransport = got.extend({
  retry: { limit: 0 },
  throwHttpErrors: false,
  // 所有外部请求（含重定向和媒体）在建立连接时再次校验实际 DNS 地址。
  dnsLookup: safeExternalDnsLookup,
});
