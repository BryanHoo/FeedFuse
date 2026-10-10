# 前端交互与接口契约

## API 消费

- 前端请求优先经过 `src/lib/api/apiClient.ts`
- 新接口如果需要被多个 feature 复用，应先补客户端封装，再落到组件
- 接口错误文案与通知优先复用 `src/lib/api/apiErrorNotifier.ts`、`src/lib/api/mapApiErrorToUserMessage.ts`

## 状态与交互

- 阅读器级交互先看 `src/app/(reader)/ReaderApp.tsx` 与 `src/features/reader/**`
- 全局 reader 快捷键归 `src/features/reader/components/ReaderLayout.tsx` 管理；快捷键必须忽略输入框、`contenteditable`、`select` 和已打开的非快捷键弹窗，文章内动作可通过显式 reader command 交给 `ArticleView` 执行。
- 新增或调整 reader 快捷键时，同步更新快捷键帮助弹窗，并在 `src/test/features/reader/ReaderLayout.test.tsx` 覆盖至少一个正向触发和一个弹窗/输入焦点保护场景。
- 文章视图相关契约先看 `src/features/articles/components/ArticleView.tsx`、`src/features/articles/hooks/useStreamingAiSummary.ts`、`src/features/articles/hooks/useImmersiveTranslation.ts`
- 设置保存逻辑先看 `src/features/settings/hooks/useSettingsAutosave.ts`
- 设置中心自动保存失败时保留当前草稿及上次成功保存的设置；密钥草稿只保留在内存，不写入 localStorage。关闭前明确提示放弃未保存草稿，用户选择继续编辑时保留内容。
- 字段错误必须提供中文字段名称与修改提示，并通过 `aria-invalid`、`aria-describedby` 关联 AI 输入；修改后恢复自动保存。网络、超时或服务错误提供“重试保存”，允许不修改草稿直接重试；仅成功响应能推进已保存版本，旧请求不能覆盖新草稿或新错误。
- 确认失败时说明本次修改未保存，网络中断、超时或响应无法解析时说明保存结果尚未确认；不可将未知结果描述为未保存。成功时确认本次设置及密钥修改全部保存，失败不能统一要求用户修正字段。
- AI 设置中的 `summaryPrompt`、`translationPrompt`、`deepThinkingEnabled` 由设置中心维护；前端只负责编辑与保存，不在组件层拼接任务级 system prompt
- `deepThinkingEnabled` 开启后，摘要卡片、智能解读等 AI 内容区域只展示最终回复；前端不应把中间思考文案、`<think>` 标签或推理过程暴露给用户
- 中栏文章列表的已读/未读按钮按当前选中 `view` 记忆用户选择；该选择优先于全局 `defaultUnreadOnlyInAll`，刷新页面和切换订阅源后仍应保留。
- 多用户登录后，前端本地状态必须按 `userId` 命名空间隔离；设置缓存使用 `feedfuse-settings:${userId}`，阅读器未读筛选使用 `feedfuse.reader.unreadOnlyByView.v1:${userId}`。
- ReaderApp 获取当前用户后必须重新读取该用户命名空间的本地设置和阅读器本地状态，避免从 anonymous 或上一个账号继承状态。
- 旧单用户 localStorage key 只允许作为默认管理员或 anonymous 的迁移兼容来源，不能让普通成员读取旧全局缓存。

## 用户管理交互契约

- 登录表单使用 `username + password`，成功后必须写入当前用户上下文并让后续本地状态按该 `userId` 隔离。
- 设置中心安全分区的模块外层只展示账号信息；当前用户资料编辑、密码修改、管理员新增用户和编辑用户都必须进入弹窗完成。
- 安全分区所有账号展示只保留用户名、角色、状态，不展示 `id`；当前账号卡片中角色和状态紧跟用户名显示。
- 设置中心安全分区展示当前用户资料；所有用户都可在“当前账号”弹窗中修改自己的用户名和密码，不在面板外直接展开资料或密码表单。
- “当前账号”弹窗里的用户名、当前密码、新密码、确认新密码必须通过同一个 `保存` 动作提交；不能拆成独立的用户名和密码保存按钮。修改密码时必须输入当前密码并原样提交，纯用户名编辑无需当前密码；保存成功或关闭弹窗后清空全部密码输入。
- 只有 admin 用户能看到第二个“用户管理”模块；该模块表格只展示用户信息，外层不直接暴露可编辑输入框。
- 初始管理员账号不出现在下方“用户管理”表格里，也不能作为该表格中的管理对象执行删除等操作。
- 当前用户、用户列表与登录返回结构都必须携带 `type = 'initial_admin' | 'admin' | 'member'`；前端展示初始用户标识和隐藏危险入口时优先依赖 `type`，不要再散落 `id === '1'` 判断。
- “删除用户”按钮只对初始用户显示；其他管理员即使能进入用户管理，也不能看到或触发删除其他用户的入口。
- 初始用户只能通过“当前账号”入口修改自己；管理员用户管理弹窗不能把初始用户当成可编辑对象。
- admin 用户可在用户编辑弹窗中修改用户名、角色和状态；新增用户使用独立弹窗录入初始密码，现有用户密码修改不再混入管理员表格编辑流程。

## 与后端联动

- 如果前端需要新字段，先确认 `src/app/api/**` 返回结构和 `src/types/**` / `src/lib/**` 是否同步
- 如果 UI 依赖新异步状态，先确认 `src/worker/**` 与 `src/server/domains/**/services/**` 是否已经稳定提供该状态
- 阅读器左栏展示订阅源刷新失败时，必须优先使用面向用户的 `fetchError` / `lastFetchError`；`fetchRawError` / `lastFetchRawError` 只作为缺少业务文案时的兜底，不能让 `Unsafe URL` 这类原始错误覆盖中文原因。
- 阅读器左栏的订阅源错误 tooltip 必须允许指针从订阅源移动到浮层，错误正文必须可选择和复制，不能在触发器失去 hover 时立即卸载。

## 订阅源自动化交互契约

- 订阅源右键菜单仍是全文抓取、AI 摘要和翻译策略的入口，具体弹窗在 `src/features/feeds/components/FeedFulltextPolicyDialog.tsx`、`FeedSummaryPolicyDialog.tsx`、`FeedTranslationPolicyDialog.tsx`。
- 策略保存通过 `src/features/feeds/components/FeedList.tsx` 调用 store 的 `updateFeed`，最终走 `src/lib/api/apiClient.ts` 的 feed 更新封装。
- 文章打开后的全文、摘要、翻译按钮状态由 `src/features/articles/components/ArticleView.tsx` 结合 `getArticleTasks` 轮询结果控制。
- `fullTextOnOpenEnabled` 只影响打开文章时的全文等待与按钮可用性；AI 摘要和翻译仍通过各自 enqueue 接口进入 worker。
- `Feed.kind === 'ai_digest'` 的文章不触发全文抓取和翻译操作，避免对智能报告二次处理。
- 带 `mediaAttachments` 的播客文章在 `ArticleView` 中渲染原生音视频播放器，并隐藏全文抓取、AI 摘要和翻译入口；自动打开触发也必须跳过。
- `Feed.isPodcast` 由后端 snapshot 从 `article_media_attachments` 推导；播客 RSS 源在左栏右键菜单中不显示全文抓取、AI 摘要和翻译配置项。

## Fever 来源交互契约

- 前端统一通过 `src/lib/api/apiClient.ts` 消费 Fever 账号接口，不直接在组件里拼 `/api/fever/**` 请求。
- `Feed.provider === 'fever'` 时，UI 必须把该 feed 视为远端托管源：展示 `Fever` 来源标记，并通过 `remoteManaged` / `remoteSource` 驱动只读或受限交互。
- Fever feed 仍出现在阅读器左栏和快照里，但编辑弹窗中的标题、URL、分类等上游托管字段必须只读，避免把本地表单当成上游配置入口。
- Fever feed 的右键菜单不能暴露本地删除、改分类这类会与上游权威状态冲突的入口；这类操作只能通过 Fever account 级入口处理。
- 设置中心为 Fever account 提供独立分区入口；新增账号和手动同步通过该分区完成，不在普通添加 RSS 源对话框中混入 Fever feed 创建，也不与密码/登录安全操作混放。
- Fever account 分区还必须提供自动同步配置入口，并通过 `src/lib/api/apiClient.ts` 的 `/api/fever/accounts` PATCH 保存 `enabled` 与 `autoSyncIntervalMinutes`。
- Fever account 的新增和编辑共用同一个弹窗表单，避免新增/编辑表单规则分叉；卡片右上角还必须提供服务级启用开关，支持不进弹窗快速启用/停用账号。
- Fever account 分区通过 `src/lib/api/apiClient.ts` 的 `/api/fever/accounts` 保存 `enabled` 与 `autoSyncIntervalMinutes`；当同步间隔大于 `0` 时自动启用自动同步，等于 `0` 时视为关闭自动同步，不再单独暴露自动同步开关字段给表单。
- Fever account 的新增和编辑必须在前端显示后端返回的连接校验失败，而不是先乐观保存再等同步阶段报错。
- 自动同步配置使用显式保存动作而不是隐式表单提交；保存成功后前端必须回显后端返回的账号配置，避免本地草稿与真实调度状态漂移。
- Fever 账号分区必须暴露删除账号配置入口；同步失败后需要显示后端返回的账号级错误结果，避免用户只看到开始态而没有终态反馈。

## 批量已读后台反馈契约

- 收到批量已读的 HTTP 202 或非空 `task` 仅表示受理，不能直接把 Fever 文章和未读数清零，也不能发出整批成功提示。
- 阅读器显示批次的完成进度、成功与失败数量、逐项失败原因及“重试失败项”；查询失败保留已知进度并提供重新查询。进行中的批次关闭页面后继续执行，重新打开阅读器从服务端恢复。
- 逐项进度变化后读取服务端阅读器快照，按实际成功结果同步文章状态。仅本地批量兜底成功时不能修改失效或停用的 Fever 来源状态。
- 任务界面及轮询以当前用户为作用域；切换用户或卸载时停止旧轮询，旧提交与重试响应不能污染新用户任务。
- 交互回归位于 `src/test/features/articles/BatchReadProgress.test.tsx` 与 `src/test/store/appStore.test.ts`。
