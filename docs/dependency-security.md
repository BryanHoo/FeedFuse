# 生产依赖安全复核

复核日期：2026-10-04。范围为当前代码、`pnpm-lock.yaml` 与仓库提供的 Linux / Node.js 24 Docker 部署；不代表已核验线上配置或容器镜像的全部系统库。

这些依赖更新随 `0.4.3` 发布，版本变更见 [更新日志](../CHANGELOG.md#043---2026-10-08)。除末尾的发布前复查外，下述审计与测试数量为复核当天的记录。

## 更新与审计

`pnpm audit --prod` 更新前为 2 critical、30 high、34 moderate、10 low；更新后四项均为 0。未添加审计忽略项或强制版本覆盖。告警数量反映依赖匹配结果，不等于可利用漏洞数量。

| 依赖 | 更新前 | 更新后 |
| --- | --- | --- |
| `next` | `16.1.6` | `16.3.8` |
| `sharp` | `0.34.5` | `0.35.5` |
| `sanitize-html` | `2.17.1` | `2.18.0` |
| `tsx` | `4.21.0` | `4.23.15` |
| 直接开发依赖 `postcss` | `8.5.6` | `8.5.28` |

锁文件同时更新 `undici`、`@babel/core`、`browserslist`、`baseline-browser-mapping`、`nanoid` 和 `http-cache-semantics` 等间接依赖。Next.js 自带的 `postcss` 为上游固定的 `8.5.23`；Next.js 与应用使用的 `sharp` 均解析到 `0.35.5`。

## 按功能与部署条件筛选

| 告警类别 | 当前证据与判断 |
| --- | --- |
| sharp / libvips / libheif 图片解析 | `src/app/api/media/image/route.ts` 在指定转换参数时解析外部图片，`src/app/api/feeds/[id]/favicon/route.ts` 也解码外部图标。两者有会话校验，图片代理还有签名和网络限制；这些措施不能保证图片内容安全，因此优先升级 sharp。参见 [sharp 公告](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)。 |
| Next.js AVIF Image Optimization RCE | 公告针对 Image Optimization API 解析 AVIF。项目没有导入 `next/image`，但这不足以证明框架端点不可访问；应用还有上述自建 sharp 路径，故同时升级框架与 sharp。参见 [上游公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)。 |
| Next.js Windows RCE | 仓库 Dockerfile 使用 `node:24-alpine`，不满足 Windows 文件系统前提；自行部署到 Windows 时需重新评估。仍随框架升级消除旧版本。参见 [上游公告](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)。 |
| Next.js Server Components / 条件性框架功能 | 使用 App Router，应升级处理 Server Components 相关风险。未发现 `use server`、Middleware / Proxy、外部 rewrites、i18n、Cache Components、CSP nonce 或 `beforeInteractive` 配置，不把这些特定功能告警直接认定为当前可利用。实际 CDN / 反向代理缓存行为仍需部署侧核验。 |
| `sanitize-html` XSS | RSS / 全文 HTML 是不可信输入，`src/server/integrations/rss/sanitizeContent.ts` 实际使用此库。当前未放行 SVG SMIL，且对 `video.poster` 另有协议校验，可降低部分公告的适用性；仍升级清洗器与其解析依赖。 |
| `jsdom > undici` | 现有 `new JSDOM(...)` 用于 HTML / XML 解析，未启用脚本执行或外部资源加载，也未调用其 WebSocket、共享缓存或 retry interceptor。外部 RSS / 图片请求由 got 客户端处理。升级到 `undici@7.30.0`，避免后续功能启用时引入旧漏洞。Node.js 内置 fetch 的实现另随 Node.js 镜像维护。 |
| `tsx > esbuild` | Worker 用 tsx 执行 TypeScript，未启动 esbuild 开发服务器；Windows 开发服务器文件读取告警不符合仓库 Linux 生产入口。升级 tsx 后该链解析到 `esbuild@0.28.2`。 |
| PostCSS / Babel / Browserslist / nanoid | 多数路径用于构建及编译，未发现生产 API 接受任意构建配置或 Browserslist 查询。清洗器不放行 `style` 属性。仍更新相关依赖，避免把“被生产依赖引用”与“可由生产请求触发”混为一谈。 |

## 仍需保留的缓存风险判断

`got > cacheable-request > http-cache-semantics` 已更新至 `4.3.0`。当前 [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) 只匹配 `<=4.2.0`，因此审计不再报告它；这不证明新版本已修复相关行为。

对安装的 `4.3.0` 做纯本地验证：构造共享缓存策略，响应包含 `Set-Cookie` 和 `Cache-Control: max-age=60`，再以 `Cache-Control: max-stale=99999` 查询同一 URL，得到 `maxAge() === 0` 且 `satisfiesWithoutRevalidation(...) === true`。没有发起外部请求或使用真实会话数据。上游 [问题说明](https://github.com/kornelski/http-cache-semantics/issues/56) 描述了这一前提。

当前 `src/server/infra/http/externalHttpClient.ts` 是唯一 got 入口，`got.extend(...)` 和各请求都没有配置缓存，已核验默认 `cache` 为 `undefined`。RSS 的 ETag / Last-Modified 条件请求不等于启用 got 共享缓存。因而当前代码未满足该告警的共享缓存利用前提。

后续若启用 got 缓存、缓存携带会话的响应，或将此客户端改为共享代理，必须重新核验该行为及上游修复；不能仅凭审计为 0 放行。

## 验证

- `pnpm install --frozen-lockfile`：通过。
- `pnpm audit --prod`：0 条告警。
- `pnpm lint`、`pnpm type-check`：通过。
- `pnpm test:unit`：230 个测试文件通过，1186 项测试通过，4 项数据库集成测试跳过；包含真实 sharp 图片转换和图标解析测试。
- `pnpm build`：通过，生成 standalone 产物。移除对缺失的 `scripts/build/clean-build-artifacts.mjs` 的调用，并让 Next.js 复用 `config/typescript/tsconfig.typecheck.json`，与生产类型检查保持一致；测试夹具仍由 Vitest 执行。`next-env.d.ts` 包含新版 Next.js 自动生成的 `root-params.d.ts` 引用。

复核依据仅覆盖当前锁文件和配置。依赖或部署条件变化后，应重新运行审计并检查相关调用路径；发布时需要重新构建并部署 Web 与 Worker 镜像。

## 0.4.3 发布前复查

2026-10-08 重新执行 `pnpm audit --prod` 时，发现 `jsdom > css-tree > source-map-js@1.2.1` 存在一项 high 告警：[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。公告针对恶意索引 source map 的 section offset 导致事件循环阻塞；上游 [1.2.2 发布说明](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) 包含修复。

发布锁文件将这条依赖链更新到 `source-map-js@1.2.2`，未添加审计忽略项或强制版本覆盖。应用使用 jsdom 解析 HTML / XML，未发现接受外部 source map 的接口；此判断基于现有调用路径，不将依赖告警直接等同于应用可利用漏洞。

发布前验证：

- `pnpm install --frozen-lockfile --offline`：通过，使用本地已有的修复版本。
- `pnpm audit --prod`：0 条告警。
- `pnpm lint`、`pnpm type-check`、`pnpm build`：通过，生成 standalone 产物。
- `pnpm test:unit`：230 个测试文件通过，1195 项测试通过；未配置独立测试数据库，4 项数据库集成测试跳过。
