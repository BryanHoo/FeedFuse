# Design

## 1. Data Model Changes

### 1.1 `feeds`

Add:

1. `title_translate_enabled boolean not null default false`
2. `body_translate_enabled boolean not null default false`

Reason: feed runtime state already lives in `feeds`; translation gating must be available in worker/API snapshot without joining UI JSON settings.

### 1.2 `articles`

Add:

1. `title_original text not null default ''`
2. `title_zh text null`
3. `title_translation_model text null`
4. `title_translation_attempts int not null default 0`
5. `title_translation_error text null`
6. `title_translated_at timestamptz null`
7. `ai_translation_bilingual_html text null`
8. `ai_translation_segments_json jsonb null` (optional debug metadata)

Compatibility:

1. Keep reading old `ai_translation_zh_html` for backward compatibility.
2. Prefer `ai_translation_bilingual_html` in new rendering path.

### 1.3 `app_settings`

Add:

1. `translation_api_key text not null default ''`

Reason: independent translation API key cannot be stored in client-visible `ui_settings`.

## 2. Translation Config Resolution

Implement a resolver:

1. Input:
   - normalized UI settings `ai.model/apiBaseUrl`
   - normalized UI settings `ai.translation.*`
   - server secrets: `ai_api_key`, `translation_api_key`
2. Rule:
   - if `translation.useSharedAi=true`:
     - use `ai.model/apiBaseUrl/ai_api_key`
   - else:
     - use `translation.model/apiBaseUrl/translation_api_key`
3. Validation:
   - fail with machine-readable reason if required key/base/model is missing.

## 3. Job Architecture

### 3.1 New queues

1. `ai.translate_title_zh`
2. `ai.translate_article_bilingual`

Both queues:

1. use `singletonKey=articleId`
2. run only if target field is empty

### 3.2 Title translation job

1. Triggered only for new articles during feed ingest, and only when `feed.title_translate_enabled=true`.
2. Model input: plain title string.
3. Write:
   - `title_zh`
   - `title_translation_model`
   - `title_translated_at`
4. Retry policy:
   - maximum 3 attempts
   - exponential delay sequence: 15s, 60s, 300s
5. On final failure:
   - keep original title path
   - persist `title_translation_error`

### 3.3 Body bilingual translation job

1. Triggered by `/api/articles/:id/ai-translate` only.
2. Guardrails:
   - block when `feed.body_translate_enabled=false`
   - source priority `content_full_html` > `content_html`
   - if no source, return `missing_source_content`
3. Translation pipeline:
   - sanitize HTML
   - parse DOM
   - extract translatable segments (`p/li/h1-h6/blockquote/td/th`)
   - skip `code/pre`
   - translate only segment text batches
   - reconstruct bilingual DOM block per segment
4. Output:
   - `ai_translation_bilingual_html`
   - `ai_translation_segments_json` (if enabled)
   - `ai_translation_model`, `ai_translated_at`

## 4. Rendering Design

### 4.1 List title

Use display priority:

1. `title_zh`
2. `title_original`
3. legacy `title`

### 4.2 Article title in translation mode

Render stacked title block:

1. line 1: original title
2. line 2: translated title

Keep current button copy `翻译/原文`; only semantics of translation mode changes to bilingual rendering.

### 4.3 Article body in translation mode

Render `ai_translation_bilingual_html`; fallback to original content if unavailable.

## 5. API Contract Updates

1. `/api/feeds` `POST/PATCH/GET` include:
   - `titleTranslateEnabled`
   - `bodyTranslateEnabled`
2. `/api/settings` include `ai.translation` subtree in normalized settings.
3. `/api/settings/ai/api-key` stays unchanged.
4. Add `/api/settings/translation/api-key` with same status/update/clear contract as AI key endpoint.
5. `/api/articles/:id/ai-translate` may return:
   - `body_translate_disabled`
   - `missing_source_content`
   - existing reasons (`missing_api_key`, `already_translated`, `already_enqueued`)

## 6. Testing Strategy

1. DB migration tests for all new columns.
2. Repository tests for new fields in select/insert/update.
3. Worker tests:
   - title auto enqueue and retries
   - body job segment extraction and reconstruction
4. API tests:
   - feed toggles persistence
   - body disabled reason
   - translation config resolution branches
5. UI tests:
   - feed dialog new toggles
   - translation button disabled when body toggle false
   - translation mode renders bilingual title/body

## 7. Risks and Mitigations

1. Risk: DOM reconstruction may produce broken markup.
   - Mitigation: strict sanitizer pass and snapshot tests for complex HTML fixtures.
2. Risk: extra job load on high-volume feeds.
   - Mitigation: singleton keys, bounded retries, optional queue concurrency cap.
3. Risk: inconsistent settings migration.
   - Mitigation: schema normalization defaults and compatibility reading path.

## 8. Implementation Notes

1. Task 41 commit scope diverged from initial add list: actual implementation also touched `FeedList.tsx` and `EditFeedDialog.tsx` to ensure translation toggle payload flows through add/edit paths.
2. Task 46 commit scope diverged from initial add list: actual implementation also included `appStore.ts` and `apiClient.test.ts` to align bilingual translation polling signal and DTO mapping coverage.
3. Task 48 lint required one follow-up fix pass after the first run:
   - removed `no-explicit-any` usage in `ArticleView.aiTranslate.test.tsx`
   - removed effect-time synchronous `setState` in `ArticleView.tsx` (`react-hooks/set-state-in-effect`)
