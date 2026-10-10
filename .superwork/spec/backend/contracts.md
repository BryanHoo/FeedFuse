# 后端接口与数据契约

## Route 到 Service

- `src/app/api/**/route.ts` 只保留请求边界逻辑
- 可复用业务流程进入 `src/server/domains/**/services/**`
- 响应格式尽量通过 `src/server/infra/http/apiResponse.ts` 等公共工具统一

## 设置写入契约

- `PUT /api/settings` 完整替换当前用户设置，必须提交完整的 `general`、`ai`、`categories`、`rss`、`logging` 及其必填嵌套字段；所有对象拒绝未知字段，不允许将缺失字段补成默认值或强制转换类型。
- 无效 JSON、非对象请求、缺失必填字段及非法类型、枚举、数值范围或 URL 必须返回 HTTP 400，使用 `validation_error` 和字段错误信息；请求校验必须先于读取旧设置、开启事务、保存设置、更新抓取间隔、裁剪文章及清理 AI 运行态。
- 兼容旧配置的 `normalizePersistedSettings` 仅用于读取和迁移，包括读取旧设置进行变更比较；不得用于把未经校验的写请求或异常保存结果转换为默认配置。
- 回归验证位于 `src/test/app/api/settings/routes.test.ts`，必须覆盖无效输入时无配置写入、无文章裁剪、无 AI 清理，以及合法完整请求保留其他配置；同时验证旧配置读取仍兼容。

## Service 到 Repository

- service 负责业务顺序、幂等规则、跨模块编排
- repository 负责查询与持久化，不承载页面语义
- 新增字段或筛选规则时，优先把断言落在 repository / service 测试

## Worker 到 Domain

- worker 任务应复用 `src/server/domains/**/services/**`、`src/server/integrations/ai/**`、`src/server/integrations/rss/**`
- 队列任务名字、状态和错误语义变更时，检查 `src/server/infra/queue/contracts.ts`、`src/server/domains/**/tasks/**`、前端轮询消费方
- AI 摘要/翻译提示词来自 `ui_settings.ai.summaryPrompt`、`ui_settings.ai.translationPrompt`；为空时必须在 `src/server/integrations/ai/**` 统一回退默认模板，不在 route/worker 内硬编码默认词
- `ui_settings.ai.deepThinkingEnabled` 属于共享 AI 运行时配置；开启后统一由 `src/server/integrations/ai/providerCompatibility.ts` 按 provider 协议映射思考参数，并追加“只输出最终结果”的 system 约束。
- OpenAI-compatible provider 至少要请求更高推理强度；DeepSeek 一类 provider 在思考模式下还必须显式传 `thinking` 开关，并避免继续传递 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 这类不会生效的采样参数。
- DeepSeek 专有 thinking 参数只能根据 provider 协议能力判断，不能只凭 `model` 名称前缀推断；像 OpenRouter 这类第三方 OpenAI-compatible 网关即使承载 `deepseek-*` 模型，也不能强行套用原生 DeepSeek 私有参数。
- AI 摘要、翻译、智能报告这类用户可见输出在写入 session、事件流、文章内容前，必须去除思考文案、`<think>` 标签和中间推理文本；如果 provider 额外返回 `reasoning_content`，也只能消费最终可见文本，不能把 reasoning-only delta 或中间推理落到 SSE、事件表或文章字段里。

## 队列初始化契约

- Web 首次入队和 Worker 启动必须共用 `src/server/infra/queue/bootstrap.ts` 的初始化入口，使用 `QUEUE_CONTRACTS` 中的队列配置，先创建被引用的死信队列。
- pg-boss 12.13.0 的 `createQueue` 不更新已有队列；存在契约配置时必须随后调用 `updateQueue`，同步重试、心跳、超时和死信等显式配置字段。无契约配置的队列保留默认创建行为，不能向 `updateQueue` 传空对象。
- 初始化成功前不能发送任务；并发调用共用初始化结果，缓存必须按 pg-boss 实例隔离，失败后允许重试。回归验证覆盖 `src/test/server/queue/bootstrap.test.ts` 和 `src/test/server/queue/queue.test.ts`。
- 标题翻译任务 `ai.translate_title_zh` 由 pg-boss 统一负责重试：队列设置 `retryLimit: 2`，即首次执行加两次重试，总计最多三次任务执行；设置 `retryDelay: 30` 和 `retryBackoff: true`，发送选项只配置去重，不覆盖重试预算。
- 标题翻译 Worker 每次失败都记录文章的累计失败次数与错误，并继续抛出异常，包括最后一次失败；累计失败次数只作诊断，不能控制单个任务的重试或把失败任务标记为完成。回归验证覆盖临时网络错误后恢复、三次失败耗尽预算、历史累计失败次数不影响当前任务，测试位于 `src/test/worker/aiTitleTranslateWorker.test.ts` 和 `src/test/server/queue/contracts.test.ts`。

## RSS 入库与过滤补偿契约

- RSS 新响应的 `ETag` / `Last-Modified` 只能在解析、文章入库、过滤任务创建及本轮裁剪成功后保存；失败始终保留上次成功处理的缓存标记。304 可作为成功响应，但其他无正文响应必须报错。
- `feed.fetch` 的超时、临时网络/DNS 故障、HTTP 408/425/429/5xx、空响应和入库/入队等基础设施异常必须拒绝 Worker 回调，由 pg-boss 退避重试；地址安全阻断、源站安全验证页面、响应限制、其他 HTTP 错误及 RSS 格式错误直接结算为永久失败。
- RSS Worker 必须启用 `includeMetadata`，根据任务实际 `retryCount` / `retryLimit`（包含发送时覆盖值）判断重试是否耗尽。重试期间不写订阅抓取终态或推进 `last_fetched_at`，刷新 run item 保持未完成；重试尝试必须绕过刷新间隔检查，避免被其他抓取推进的时间跳过。
- 仅在成功、永久失败或临时错误耗尽预算时结算订阅与刷新 run 的用户可见状态。最后一次临时失败仍必须抛出异常，让 pg-boss 标记任务 `failed` 并转入 `dlq.feed.fetch`；`retryLimit: 0` 在首次失败时结算。
- 单篇文章写入、媒体附件写入和 `article.filter` 任务创建必须共用同一 PostgreSQL 事务连接，通过 pg-boss 的 `db.executeSql` 适配器入队；入队抛错或新文章的任务 ID 为空时回滚，不能遗留无任务的 `pending` 文章。
- `article.filter_recover` 在 Worker 启动时执行一次，此后每分钟扫描活跃用户的本地文本 RSS `pending` 文章；补偿不依赖订阅抓取是否到期、去重结果或上游是否返回 304。已入库文章的补偿不以订阅是否启用为条件，Fever、非 RSS 和有媒体附件的文章不进入扫描。
- 补偿按文章主键分页，在事务内锁定并重新检查文章的用户归属与 `pending` 状态；存在 `created` / `retry` / `active` 过滤任务时跳过，历史终态任务不阻止补发。使用当前用户的过滤设置与订阅自动处理开关，保留队列去重；时间窗冲突返回空 ID 时留待后续扫描重试。
- 回归验证位于 `src/test/worker/feedIngestionReliability.test.ts`、`src/test/worker/workerRegistry.test.ts`、`src/test/worker/articleFilterRecovery.test.ts`；配置 `DATABASE_URL` 后运行 `src/test/worker/rssReliability.integration.test.ts`，使用随机隔离 schema 与真实 pg-boss 验证回调失败后的重试恢复、耗尽预算转入死信、终态延迟结算、双写回滚、缓存重试、304 后补偿、并发扫描与用户隔离，结束后清理隔离 schema。

## 数据与迁移

- schema 变化必须同步更新 `src/server/infra/db/migrations/**`
- 需要启动期迁移时，入口保持通过 `scripts/db/migrate.mjs`
- 改变环境变量契约时，同步检查 `.env.example`、`docs/development.md`、部署文档

## 应用数据库连接池契约

- `GET /api/health` 必须实际探测数据库及 Worker 心跳，二者就绪时返回 200，否则返回 503；响应保留 `{ ok, data }` 外壳、各组件状态与最后心跳时间，不暴露底层连接错误，并禁止缓存。
- 健康探测使用独立的小连接池，连接、排队和查询设置短超时，保持在容器 5 秒探测超时内结束；不得依赖业务连接池的长查询超时。
- Worker 必须在队列消费与调度注册完成后写入 `worker_heartbeats`，以数据库时钟每 15 秒更新，超过 60 秒未更新即失活；进程使用独立实例标识，正常退出等待在途更新后只删除本实例记录。
- 整体健康要求至少一个活跃 Worker；容器探测必须读取本容器的实例标识并检查对应数据库心跳，避免其他实例掩盖本容器故障。一个容器只运行一个 Worker，Dockerfile 与两份 Compose 的 Worker 健康检查保持一致。
- 心跳回归位于 `src/test/app/api/health/route.test.ts`、`src/test/worker/heartbeat.test.ts`、`src/test/worker/lifecycle.test.ts`；迁移与 SQL 回归位于 `src/test/server/db/migrations/workerHeartbeatsMigration.test.ts`，配置 `DATABASE_URL` 后使用真实 PostgreSQL 临时表与事务运行，不修改现有业务数据。

- Worker 的 SIGINT / SIGTERM 退出必须幂等：停止队列采样并等待在途采样，显式调用 pg-boss 优雅停止，等待业务回调，再关闭业务数据库连接池；停止拉取期间已发出的 fetch 仍可能返回最后一批任务，其回调也必须纳入等待，不能因退出而直接拒绝。
- pg-boss 任务等待预算为 60 秒（包含等待在途采样的时间），进程总退出上限为 70 秒，源码与部署 Compose 的 Worker 均须设置 `stop_grace_period: 75s`；调整预算时同步更新代码、两份 Compose 和部署指南。
- pg-boss 等待超时不代表业务回调已结束；连接池关闭前必须另行等待回调。清理失败或超过总预算时以非零状态退出，记录进程日志；回归覆盖重复退出、在途采样、任务等待、清理失败及退出超时，位于 `src/test/worker/lifecycle.test.ts`。

- `src/server/infra/db/pool.ts` 的共享应用连接池必须监听 `error`，避免空闲连接故障触发未捕获异常；故障连接由 `pg` 自动移除，不在监听器中重复释放。
- 池错误与排队告警写进程日志，不依赖数据库日志表；不得记录 `pg` 附加在错误上的 `client`，避免泄露连接配置和查询上下文。
- 新建连接与池内排队等待必须有有限超时；同时设置数据库端 `statement_timeout` 和更长的客户端 `query_timeout`，分别取消慢语句和兜底处理无响应。
- 监控 `waitingCount` 时同时记录 `totalCount` 和 `idleCount`，持续积压告警必须限频。采样定时器不得阻止进程退出，池关闭后必须停止采样。
- 回归验证使用真实 `pg` 驱动覆盖空闲连接错误、连接建立超时、池耗尽等待超时、查询无响应、告警限频和监控清理；对应 `src/test/server/db/pool.test.ts`，无需真实数据库。

## 多用户隔离契约

- 单实例多用户默认强隔离；所有用户私有数据必须带 `user_id`，route -> service -> repository -> worker 全链路显式传递当前 `session.userId`。
- 用户私有表的 `user_id` 必须由数据库外键引用 `users(id)`；非日志类私有数据使用 `on delete cascade`，`system_logs.user_id` 可为空并使用 `on delete set null` 保留系统级日志语义。
- `requireApiSession()` 返回当前用户上下文 `{ userId, role, sessionVersion }`；route 不能再把鉴权结果当成简单布尔值使用。
- 用户显式提交 `categoryId` 时，service / repository 在写入 `feeds`、`ai_digest` 等用户私有资源前，必须校验该分类存在且 `categories.user_id = session.userId`；不能只依赖前端下拉选项或全局 `category_id -> categories(id)` 外键。
- `feeds.category_id` 的同用户归属必须有数据库层兜底；即使应用层漏校验，也要拒绝把某个用户的 feed / ai_digest 绑定到其他用户的分类。
- session payload 必须包含 `userId`、`role`、`sessionVersion`、`iat`、`exp`；用户禁用、重置密码或修改密码时必须递增 `session_version` 使旧 session 失效。
- session cookie 必须保持 `HttpOnly`、`SameSite=Lax` 和 `Path=/`；未显式配置时生产环境默认带 `Secure`，但 HTTP / 内网自托管可以通过 `AUTH_COOKIE_SECURE=false` 关闭。
- 密码字段必须按用户提交的原文校验、验证和哈希，不能 `trim()` 或做空白字符归一化；前后空格属于密码内容。
- 用户私有表的唯一约束必须按用户作用域设计，例如 `(user_id, lower(name))`、`(user_id, url)`；跨用户允许相同分类名、订阅 URL 或外部账号标识。
- 用户私有关系表的唯一键、upsert 冲突键和数据库兜底也必须按用户作用域设计；`article_tasks`、`feed_refresh_run_items`、Fever 映射、AI digest sources、AI/翻译会话、favicon、媒体附件等表不能在冲突更新中重写 `user_id`，并且必须拒绝关联到其他用户的父资源。
- `articles.duplicate_of_article_id` 也属于用户私有关联；迁移必须清理历史跨用户重复源引用，数据库层必须拒绝把文章指向其他用户的重复源文章。
- `article_ai_summary_sessions.superseded_by_session_id` 也属于用户私有自引用；迁移必须清理历史跨用户 supersede 引用，数据库层必须拒绝把摘要会话指向其他用户的摘要会话。
- AI digest 的 `selectedFeedIds` 只能保存当前用户自己的本地 RSS feed；不能保存其他用户、Fever 投影源或不存在的 feed id，即使生成 worker 后续会按用户过滤候选文章。
- `app_settings` 只保留全局兼容配置；用户级 UI 设置、AI key、translation key 必须读写 `user_settings`。
- 历史单用户数据迁移必须归属默认管理员，包括旧 `system_logs`；新系统级日志仍可使用 `user_id = null` 保留系统级语义。
- 所有异步任务 payload、队列 singleton key、任务状态、系统日志和用户操作日志涉及用户私有数据时都必须携带 `userId`；定时任务没有会话上下文时必须按 active users fan-out。
- 外部 RSS / fulltext 请求日志涉及用户资源时必须写入顶层 `system_logs.user_id`；只把用户标识放进 `context` 不能满足 `/api/logs` 的用户过滤契约。
- AI 配置变更触发的运行态清理也属于用户私有异步状态；`cleanup` / cancel / fail 这类收尾逻辑必须按当前用户 `userId` 限定更新范围，并在写入 `article_ai_summary_events`、`article_translation_events` 等事件表时同步写入 `user_id`。
- 即使 `translation.useSharedAi = false`，专用翻译链路仍会消费共享的 `ui_settings.ai.deepThinkingEnabled`；因此 translation fingerprint 与 cleanup scope 也必须覆盖这个开关，避免切换深度思考后旧翻译 session 继续按过期配置运行。
- Fever、AI digest、feed refresh、全文抓取、文章过滤、摘要、翻译等 worker 在读取或写入数据前必须用 `userId` 校验资源归属。
- 管理员才可创建用户、列表用户、重置密码、禁用或启用用户；普通用户只能读取自己的资料和修改自己的密码。
- 删除用户属于更强权限操作：只有初始用户可删除其他用户，且初始用户自身永远不可删除；后端必须在 route/service 层显式校验，不能只依赖前端隐藏按钮。
- 初始用户语义固定绑定 `users.id = '1'`；删除权限、初始密码 fallback、旧会话兼容分支都不能再依赖 `username === 'admin'` 这类可变字段。
- 用户 DTO 必须稳定返回 `type = 'initial_admin' | 'admin' | 'member'`；其中 `initial_admin` 只由固定初始用户派生，前端展示和常规权限分支优先消费该字段。
- `PATCH /api/users/[id]` 作为管理员用户资料编辑入口时，允许一次提交 `username`、`role`、`status` 组合更新；这类资料编辑保持管理员语义，不再承担普通用户自助改密入口。
- `PATCH /api/users/[id]` 即使由其他 admin 调用，也必须拒绝修改初始用户；初始用户资料只能走本人会话入口修改，不能作为后台管理对象被代改。
- `PATCH /api/users/me` 是当前登录用户自助编辑入口，允许一次提交 `username` 与可选的 `nextPassword`；用户名冲突继续返回 `用户名已存在`，纯用户名编辑不递增 `session_version`。
- 当前用户通过 `PATCH /api/users/me` 提交非空 `nextPassword` 时，必须同时提交并验证 `currentPassword`；有效会话不能替代改密身份确认。统一保存、`POST /api/users/me/password` 和 `POST /api/settings/auth/password` 必须共用自助改密服务，统一验证当前密码、新密码至少 8 位以及新旧密码不同。
- 自助改密验证失败时不得写入用户名或密码，也不得下发新会话；统一保存须用一次数据库更新写入用户名与密码。成功改密后递增 `session_version` 使旧会话失效，并按更新后的版本下发当前会话 cookie；纯用户名编辑无需当前密码且不递增会话版本。
- 自助改密回归覆盖所有入口的缺失或错误当前密码、相同或过短新密码、失败时无写入和无新会话，以及成功改密后的 cookie 版本；服务测试使用真实密码哈希验证前后空格保留。
- `POST /api/users/me/password` 仅保留兼容用途；设置中心“当前账号”交互不再把用户名保存和密码保存拆成两个接口动作。
- 兼容密码接口若继续保留，必须收束为“仅初始用户本人修改自己的密码”；其他 admin 不能借兼容入口修改初始用户或切换成初始用户会话。

## RSS 网络访问契约

- RSS 抓取必须先访问用户提供的地址；收到 HTML 安全检测页时才允许尝试一次 `www` / 裸域变体，不能添加特定站点映射或无条件改写域名。本机、IP、带凭据及非默认端口地址不参与域名变体恢复。
- 安全检测页需结合 HTML 根节点与检测特征识别，不能把 RSS 正文中的相关内容误判为检测页。备用请求及重定向必须复用 SSRF、响应大小和超时限制，换主机时去掉原主机的条件缓存请求头，且只有可解析的 RSS/Atom 响应才能视为恢复成功。
- 安全检测恢复失败时，校验接口返回 `access_blocked`，后台更新记录 `fetch_access_blocked`，明确提示源站安全验证阻止访问；备用主机的网络或解析错误不能覆盖该诊断，安全阻断和资源限制错误仍按原有规则上报。回归测试覆盖 `src/test/server/http/externalHttpClient.feedAccess.test.ts`、RSS 校验接口和后台错误映射。
- `src/server/integrations/rss/ssrfGuard.ts` 是 RSS 外链安全判定的统一入口；`route.ts`、worker 和抓取流程不要各自散落一套网络地址规则。
- `RSS_NETWORK_MODE=public` 不得默认豁免本机或 Docker 宿主机地址；`localhost`、`host.docker.internal` 与 IP 字面量必须按实际 IP 判断，回环地址仅能由部署管理员在 `custom` 模式下通过 `RSS_ALLOWED_CIDRS` 显式放行。网络例外对所有账号的 RSS、正文与媒体请求生效。
- URL 预检不能替代连接时 DNS 校验；外部 HTTP 连接必须校验此次解析的全部候选地址并直接使用已校验结果，重定向和备用主机同样受限。未解析主机名的预检兼容不能绕过连接校验。回归测试需覆盖 DNS 从公网变成回环、混合公网/私网结果及管理员 CIDR 例外，测试入口为 `src/test/server/http/externalHttpTransport.ssrf.test.ts`。
- RSS 链接在发起抓取前要校验原始 URL，抓取完成后如果拿到了重定向后的 `finalUrl`，还必须再次按相同策略校验，避免通过公网入口跳转到内网或 fake-ip 地址绕过限制。
- RSS 和 fulltext 这类外部 HTTP 抓取不能依赖客户端自动跟随重定向；必须在每一跳 `Location` 发起请求前先按同一安全策略校验目标 URL。
- Docker/host fallback 只能用于网络类失败；`Unsafe URL`、响应体超限和重定向次数超限这类确定性错误必须保留原始错误。
- 外部 RSS 响应必须设置读取大小上限；写入 `system_logs.details` 的上游失败响应必须截断，避免超大响应直接落库。
- `RSS_NETWORK_MODE=lan` 只额外允许 RFC1918 局域网地址；`198.18.0.0/15` fake-ip 兼容只属于 `RSS_NETWORK_MODE=fake-ip`。
- `.local` 主机名在 `RSS_NETWORK_MODE=lan` 或 `custom` 下不能直接拒绝，必须先解析，再按解析出的 IP 是否命中 RFC1918 或 `RSS_ALLOWED_CIDRS` 判定。
- RSS 安全阻断不能只返回“链接不安全”这类泛化文案；`/api/rss/validate` 和 worker 刷新失败必须尽量说明具体原因，例如 fake-ip、内网地址、本机回环地址、本地域名、账号密码、协议不支持或 DNS 无法解析。
- fake-ip 阻断提示必须包含解析出的 `198.18.0.0/15` 地址和当前 `RSS_NETWORK_MODE`，并明确提示需要 `RSS_NETWORK_MODE=fake-ip`。
- DNS 返回 IPv4-mapped 或 IPv4-translated IPv6 地址（如 `::ffff:198.18.0.41`、`::ffff:0:c612:30`）时，必须先还原为 IPv4，再按 fake-ip、RFC1918 和自定义 CIDR 规则判定。

## 媒体代理契约

- `/api/media/image` 代理 URL 的签名语义由 `src/server/integrations/media/imageProxyUrl.ts` 统一生成和校验；route 只能做请求边界解析、鉴权、签名校验和上游响应透传。
- 图片、视频、音频等媒体代理的 SSRF 防护必须统一复用 `src/server/integrations/media/mediaProxyGuard.ts`，不要在具体 route 或抓取函数里重复实现网络地址规则。
- 媒体代理必须完全复用 RSS 网络模式语义；`RSS_NETWORK_MODE=fake-ip` 时允许 `198.18.0.0/15` fake-ip 解析结果，`lan` 时允许 RFC1918 地址，`custom` 时按 `RSS_ALLOWED_CIDRS` 放行，`.local`、localhost、本机回环地址和 `host.docker.internal` 这类本机目标也必须交给 RSS guard 统一判定，不能在媒体代理内额外收紧。
- 修改媒体代理签名、网络安全策略或 HTML 媒体改写时，至少覆盖 `src/test/app/api/media/image/route.test.ts`、`src/test/server/media/mediaProxyGuard.test.ts` 和 `src/test/server/media/rewriteHtmlImages.test.ts` 的相关用例。

## 阅读快照契约

- 文章按 `(coalesce(published_at, 'epoch'::timestamptz), articles.id)` 降序分页，下一页使用严格 `<`；`nextCursor` 必须取本页最后一条，额外查询的第 `limit + 1` 条只用于判断是否存在下一页，末页返回 `null`。
- 分页回归测试必须串联实际返回的游标，验证文章不遗漏、不重复，并覆盖相同发布时间、空发布时间和末页；对应测试位于 `src/test/server/services/readerSnapshotService.cursor.test.ts`。
- `/api/reader/snapshot` 的文章 `summary` 只服务列表预览；返回前必须把连续空白规范化为单个空格，并限制为最多 `280` 个 Unicode 码点，截断时以 `…` 结尾。
- 摘要截断只能发生在快照 DTO 映射阶段；文章详情、正文翻译资格判断和其他需要完整语义的服务必须继续使用完整摘要。
- 调整快照摘要规则时，至少覆盖 `src/test/server/services/readerSnapshotService.previewImage.test.ts` 和 `src/test/app/api/reader/snapshot/route.test.ts` 的相关用例。

## 订阅源自动化契约

- 订阅源自动化字段属于 `Feed` / feed DTO 合约，包括 `fullTextOnOpenEnabled`、`fullTextOnFetchEnabled`、`aiSummaryOnOpenEnabled`、`aiSummaryOnFetchEnabled`、`bodyTranslateOnFetchEnabled`、`bodyTranslateOnOpenEnabled`、`titleTranslateEnabled`、`bodyTranslateEnabled`。
- `src/app/api/feeds/**` 只负责请求边界和响应 DTO；字段持久化落在 `src/server/domains/feeds/repositories/feedsRepo.ts`，业务编排优先放在 `src/server/domains/feeds/services/**`。
- 入库链路的自动 AI 触发统一走 `src/worker/autoAiTriggers.ts`，只根据 `aiSummaryOnFetchEnabled`、`bodyTranslateOnFetchEnabled` 和文章已有内容决定是否入队。
- 打开文章链路通过 `src/app/api/articles/[id]/fulltext/route.ts`、`ai-summary/route.ts`、`ai-translate/route.ts` 创建 `article_tasks`，状态由 `src/app/api/articles/[id]/tasks/route.ts` 返回给前端轮询。
- AI 摘要/翻译提示词来自 `ui_settings.ai.summaryPrompt`、`ui_settings.ai.translationPrompt`；为空时必须在 `src/server/integrations/ai/**` 统一回退默认模板，不在 route/worker 内硬编码默认词。
- 开启 `ui_settings.ai.deepThinkingEnabled` 后，AI 摘要 SSE 只能下发最终可见文本增量；不能把 `reasoning_content`、thinking-only delta 或思考流原样写入 `article_ai_summary_sessions`、`article_ai_summary_events` 或文章摘要字段。
- 流式 AI 摘要如果恢复已有 `article_ai_summary_sessions.draft_text`，完成态 `finalText` 必须基于累计后的可见草稿生成，不能只取本次恢复后新增的 delta，否则重试或恢复运行会截断前半段摘要。

## AI 流事件与持久化契约

- 手动摘要创建由 `aiSummarySessionService` 编排：事务内锁定当前用户的文章行，重新检查会话和任务，再用同一连接创建摘要会话、`article_tasks` 与 pg-boss 队列记录；通过 `db.executeSql` 适配器入队。入队抛错、去重返回空 ID 或后续业务写入失败都必须回滚；不能返回已回滚的新会话 ID，也不能提前替代旧会话。
- 摘要会话首次创建即绑定预分配的 `jobId`；提交后 API 不再重写 queued。缺失任务、任务 `jobId` 不匹配或已过期时，queued/running 会话不能阻止重试。
- 摘要 Worker 更新必须同时限定用户、任务 `jobId` 和预期状态；已替代会话与终态不能重新进入 running，旧 Worker 不能覆盖新任务状态。自动摘要没有 API 预建任务行，允许新 jobId 接续历史终态任务记录，但不能抢占其他 jobId 的活跃记录。条件更新未命中时停止对应的状态发布，不能再发布完成或失败事件。回归位于摘要 API、摘要仓储、摘要 Worker 与 `articleTaskStatus` 测试；配置 `DATABASE_URL` 后执行 `src/test/server/services/aiSummarySessionService.integration.test.ts`，在随机隔离 schema 中验证真实 PostgreSQL/pg-boss 回滚、提交可见性、并发请求与旧任务写入保护。
- 摘要和翻译 SSE 共用 `src/server/infra/http/eventStream.ts`，同一连接只能有一个未完成的查询；游标只在事件排入输出队列后前进，并跳过旧 ID 或重复 ID；PostgreSQL bigint 游标按整数比较，不能做字符串比较或丢失超出安全整数的精度。
- 输出必须响应消费者背压，停止消费时不得持续查询或无限排入事件；重放查询按 ID 升序、每批最多 200 条。完成或失败事件送出后关闭连接，abort/cancel 清理计时器和监听器，并丢弃晚到的查询结果。
- 摘要片段先过滤思考文本再合并，首段即时发送，其余按时间或大小合并；provider 暂停时仍需按期送出已有片段，上游报错前收到的尾部必须进入失败草稿。
- 完整草稿按时间限频保存，终态保存完整文本；开始时保存重放基准快照，不能为每个增量插入累计全文快照。前端自动重连须按事件 ID 防止重复追加或旧快照覆盖。
- 流事件清理沿用 Worker 启动时及每小时维护任务，按用户清理完成超过 7 天的中间事件，每类每用户每次最多 5000 条；活跃会话、终态事件及会话结果保留。
- SSE 返回 `X-Accel-Buffering: no`；Nginx 配置与验证步骤维护在 `docs/deploy.md`。回归覆盖两个流路由、摘要 Hook、摘要 Worker、片段批处理及维护任务。

## 播客 RSS 契约

- RSS `<enclosure>` 与 Atom `link rel="enclosure"` 中的 `audio/*`、`video/*` 附件属于文章媒体附件，持久化在 `article_media_attachments`，并通过 `Article.mediaAttachments` 返回给前端。
- 播客文章判定以已解析出的媒体附件为准；图片类附件继续作为 `previewImage` 处理，不进入 `mediaAttachments`。
- 播客文章只支持播放与普通阅读，不触发全文抓取、AI 摘要、正文翻译或文章过滤队列；worker 自动链路和 `fulltext`、`ai-summary`、`ai-translate` 手动 API 都必须返回 no-op。
- 更新播客解析、附件入库或文本自动化屏蔽逻辑时，至少覆盖 RSS/Atom 解析、附件 repository、worker 入库跳过队列、文章 API DTO、文章视图播放与按钮屏蔽测试。

## Fever 同步与写回契约

- `feeds.provider` 是长期存在的来源字段，当前允许值为 `local_rss` 和 `fever`；Fever 上游对象通过 `fever_accounts`、`fever_feed_mappings`、`fever_item_mappings`、`fever_sync_states` 投影到现有 `feeds` / `articles`。
- Fever item 返回非空 `html` 时必须将其作为权威正文，按文章 URL 清洗后直接入库，不能再下载 RSS 覆盖；只有 `html` 缺失或为空时才允许回退 RSS XML。
- Fever 正文回退到 RSS XML 时，解析器必须优先选择非空 `content:encoded`，再使用 `description` / 摘要，避免完整正文被短摘要覆盖。
- `feed.fetch` / `feed.refresh_all` 这条本地 RSS 抓取链路只允许处理 `feeds.kind = 'rss' and feeds.provider = 'local_rss'`；Fever 投影源绝不能进入本地 RSS XML 抓取队列。
- Fever 协议适配只放在 `src/server/integrations/fever/**`；route 和 worker 不直接拼 Fever 请求，也不直接解析 Fever DTO。
- Fever 同步、投影和写回编排放在 `src/server/domains/fever/services/**`；worker 仅通过 `fever.sync` 任务调度这些 service。
- Fever 账号配置还包含 `autoSyncEnabled`、`autoSyncIntervalMinutes`、`lastSyncAttemptAt`；字段持久化落在 `fever_accounts`，并通过 `/api/fever/accounts` 返回给前端。
- `/api/fever/accounts` 的创建与更新契约还包含 `enabled`；账号级自动同步状态由 `autoSyncIntervalMinutes` 推导，间隔大于 `0` 时返回 `autoSyncEnabled = true`，间隔等于 `0` 时返回 `autoSyncEnabled = false`，避免前后端各自维护两套开关语义。
- 删除 Fever account 时，必须同时删除该账号投影出来的本地 `provider = 'fever'` feeds，并清理因此变空的分类；只删除 mapping 或 account 本身而保留本地 feed 会导致左栏快照残留失效来源。
- `fever.sync_due` 是每分钟运行一次的后台调度任务，只负责挑选到期账号并入队 `fever.sync`；真正的同步执行和远端读写仍统一走 `fever.sync`。
- `fever.sync` 的队列去重键必须始终绑定 `accountId`；`runId` 只用于 `feed_refresh_runs` 跟踪，不能让不同 run 绕过账号级互斥。
- 手动 `POST /api/fever/accounts/[id]/sync` 和后台 `fever.sync_due` 在成功入队后都要写入 `lastSyncAttemptAt`，避免长时间同步期间被重复调度。
- 用户触发 `POST /api/feeds/refresh` 时，内部派发到 `fever.sync` 的账号也必须在成功入队后写入 `lastSyncAttemptAt`；不能让手动全量刷新绕过调度去重基线。
- `enqueueFeverRefreshAllTargets` 这类批量入口也必须在确认 `fever.sync` 真正入队后再写 `lastSyncAttemptAt`；重复任务或入队失败不能推迟下一次自动调度。
- 手动 `POST /api/fever/accounts/[id]/sync` 还必须先校验账号存在且处于启用状态；不存在或已停用账号不能返回“已入队”成功态。
- `POST /api/feeds/[id]/refresh` 在分流到 `fever.sync` 前，也必须校验关联 Fever account 仍然启用；停用账号不能通过 feed 级入口绕过账号状态约束。
- 用户触发 `POST /api/feeds/[id]/refresh` 或 `POST /api/feeds/refresh` 时，如果目标包含 `provider = 'fever'` 的 feed，必须分流到对应账号的 `fever.sync`，并把该账号关联的本地 feed item 一并纳入 `feed_refresh_runs` 跟踪；Fever feed 不支持 feed 级 scoped sync，单点入口也只能触发账号级同步。
- `fever_accounts` 通过 `(base_url, username)` 唯一标识一个 Fever 服务账号；重复配置必须返回冲突错误，而不是创建第二条同身份记录。
- `fever_feed_mappings.local_feed_id` 必须保持唯一；一个本地 `provider = 'fever'` 投影 feed 只能属于一个 Fever 账号，删除账号时直接删除该账号投影出的本地 feed。
- `PATCH /api/articles/[id]` 对 Fever article 必须先远端 `mark item`，成功后再提交本地 `is_read` / `is_starred`；本地 RSS article 保持直接本地更新。
- 阅读快照和 feed 列表必须过滤 `fever_item_mappings.is_active = false` 的 article，并返回 `provider`、`remoteManaged`、`remoteSource`，让前端能区分远端托管源。
- 阅读快照还必须同时过滤关联 `fever_feed_mappings.is_active = false` 的 article；不能出现左栏源已消失但聚合视图和未读计数仍保留旧文章。
- 阅读快照的文章列表、`totalCount` 和左栏 `unreadCount` 必须使用同一套 Fever active 过滤条件；不能只在列表查询里隐藏失效 article，否则会出现“列表为空但计数仍大于 0”的漂移。
- `listFeeds` 必须隐藏没有任何 `fever_feed_mappings.is_active = true` 记录的 `provider = 'fever'` 本地投影 feed，避免上游删除后左栏残留孤儿来源。
- `listFeeds` 还必须隐藏只关联到 `enabled = false` Fever account 的 `provider = 'fever'` 投影 feed；停用账号后左栏不能继续暴露其 RSS 来源。
- Fever feed 已存在本地投影时，同步仍必须回写远端 `title`、`url`、分类和 `siteUrl/iconUrl` 变化；Fever 是权威源，不能只更新 mapping 快照而不更新本地 feed DTO。
- 在没有可靠全量校正语义前，`fever.sync` 不能根据单次 `items` 响应把未返回的 Fever item 直接标记为 inactive；单次响应可能只是分页或窗口结果。
- Fever 同步必须显式区分增量模式与全量校正模式；只有全量校正才能根据返回的 `items` 集合失活缺失 item，并写回 `last_full_sync_at`。
- Fever article 的写回查询必须同时过滤 `fever_item_mappings.is_active = true`、`fever_feed_mappings.is_active = true` 和 `fever_accounts.enabled = true`；已停用或已失效的来源不能继续参与远端写回。
- `POST /api/fever/accounts` 与 `PATCH /api/fever/accounts` 在写入连接配置前必须先验证 Fever 服务可连通且凭据有效，不能把错误配置保存成成功状态。
