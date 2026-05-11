# 早班私人 FM 设计

## 目标

早班私人 FM 是智能报告源的可选增强能力。开启后，每次智能报告生成成功，会基于同一批原始来源文章生成一份适合收听的口播稿，并调用 StepFun TTS 生成可播放音频。

## 范围

- 私人 FM 挂在智能报告文章下，不新增独立订阅源类型。
- 私人 FM 使用内置口播提示词，不读取智能报告正文，也不受用户智能报告提示词长短影响。
- 私人 FM 失败不影响智能报告文章生成成功。
- 音频文件跟随对应智能报告文章保留；文章清理后，对应 FM 元数据和音频文件也应清理。
- 第一版不做固定早班时间、不做公开分享链接。

## 数据与配置

- `ai_digest_configs.private_fm_enabled` 控制单个智能报告源是否随报告生成私人 FM。
- `private_fm_episodes` 保存每篇智能报告文章对应的 FM 状态、口播稿、音频分片路径、合并音频路径、TTS 参数与错误信息。
- 全局设置新增 `privateFm`：StepFun API 地址、模型、音色、语速、音量、格式。
- StepFun API Key 单独保存在 `app_settings.private_fm_api_key`，避免暴露在前端持久化 JSON 中。
- 音频文件写入 `FEEDFUSE_MEDIA_DIR`，默认 `/data/feedfuse/media`。
- Docker 镜像需要预创建 `/data/feedfuse/media` 并授权给运行用户 `appuser`；已存在的 Docker volume 若由 root 创建，需要运维执行一次 `chown` 修复。

## 生成流程

1. AI Digest run 成功并持久化报告文章。
2. 若报告源启用了私人 FM，则创建或复用对应 episode，并投递 `private_fm.generate` 队列任务。
3. worker 读取该 run 的来源文章，而不是读取报告正文。
4. worker 使用内置口播提示词生成口播稿。
5. 口播稿写入 episode，状态进入 `script_ready`，前端显示“口播稿已生成”。
6. 口播稿按不超过 1000 字符切成自然段分片，逐段调用 StepFun 非流式 TTS。
7. 所有分片成功后，worker 调用 `ffmpeg` 将分片合并为 `full.mp3`，并写入 `merged_audio_path`。
8. 成功后 episode 进入 `succeeded`，文章页优先展示合并后的单条音频；失败后 episode 进入 `failed`，文章页展示失败原因和重试入口。
9. 失败后的重试默认复用已有 `script_text`，只重新执行 TTS；成功后的“重新生成”会清空旧口播稿与音频并重新生成完整内容。
10. 重试复用已有 `script_text` 时，后端初始状态使用 `script_ready`，前端也会根据 `script_text` 显示“口播稿已生成，正在生成音频”，避免误导用户以为正在重复调用 LLM。
11. `queued`、`running`、`script_ready` 超过 10 分钟未更新时视为超时，前端展示重试入口，后端允许重新入队。
12. worker 只执行 episode 上记录的最新 `job_id`；旧 job 到达时直接跳过，避免并发重试重复调用 TTS。
13. StepFun TTS 单个请求设置超时，超时后 episode 进入 `failed`，避免外部请求长期挂起。

## 播放与接口

- `GET /api/articles/:id/private-fm` 返回当前文章的 FM 状态、口播稿、合并音频地址和兼容用音频分片地址。
- `POST /api/articles/:id/private-fm` 手动补生成或重试，body 支持 `mode: "retry" | "regenerate"`。
- `GET /api/private-fm/episodes/:id/audio/full` 鉴权后返回合并后的完整音频。
- `GET /api/private-fm/episodes/:id/audio/:part` 鉴权后返回音频分片，作为旧数据兼容兜底。
- 前端优先播放合并后的单条音频，只有旧 episode 缺少 `merged_audio_path` 时才回退到分片播放。
- 对已成功但缺少 `merged_audio_path` 的旧 episode，手动触发生成会投递合并专用任务，只合并现有分片，不重新调用 LLM 或 TTS。

## 口播稿

- 口播稿保存在 `private_fm_episodes.script_text`，不单独写入媒体目录。
- 默认目标长度为 1800-2600 个中文字符，素材特别少时也尽量不少于 1200 个中文字符。
- 音频分片保存在 `FEEDFUSE_MEDIA_DIR` 下的 `private-fm/<episode-id>/<part>.mp3`。
- 合并后的完整音频保存在 `FEEDFUSE_MEDIA_DIR` 下的 `private-fm/<episode-id>/full.mp3`，路径记录在 `private_fm_episodes.merged_audio_path`。

## 错误处理

- 缺少 StepFun API Key：episode 标记为 `failed`，错误码 `missing_private_fm_api_key`。
- StepFun 限流或鉴权失败：映射为可读错误，不影响智能报告状态。
- StepFun 返回非 2xx HTTP 响应：episode 标记为 `failed`，错误码 `private_fm_tts_http_error`，错误信息保留 HTTP 状态码和截断后的响应摘要，便于定位模型、音色、额度或参数问题。
- 音频目录不可写：episode 标记为 `failed`，错误码 `private_fm_storage_error`。
- 已有未超时的 `queued`、`running` 或 `script_ready` episode 时，重复生成请求返回现有任务状态，不重复入队。
- 私人 FM 队列任务不使用长时间 singleton 去重；幂等由 episode 状态控制，避免 TTS 失败后短时间内无法重试。
- 失败后 30 秒内再次点击重试返回 `retry_cooldown`，避免快速重复消耗 TTS。
- 后端只允许已成功 episode 使用 `regenerate` 清空口播稿；失败重试即使传入 `regenerate` 也降级为 `retry`，优先复用已有口播稿。
