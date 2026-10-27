import got from 'got';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { safeExternalDnsLookup } from '@/server/integrations/rss/ssrfGuard';

// 跨境源站的 TCP 握手经常接近 Node 默认的 250ms；过早切换地址会将可达源误判为超时。
// 给每个候选 IP 留出握手及一次 SYN 重传的时间，总请求时限仍由各调用方控制。
const connectionOptions = {
  keepAlive: true,
  timeout: 5000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 1500,
};

export const externalHttpTransport = got.extend({
  retry: { limit: 0 },
  throwHttpErrors: false,
  // 所有外部请求（含重定向和媒体）在建立连接时再次校验实际 DNS 地址。
  dnsLookup: safeExternalDnsLookup,
  // 使用独立 Agent 保留连接复用和空闲超时，避免修改数据库、AI SDK 等其他客户端。
  agent: {
    http: new HttpAgent(connectionOptions),
    https: new HttpsAgent(connectionOptions),
  },
});
