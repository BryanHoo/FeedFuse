# translation Specification Delta

## ADDED Requirements

### Requirement: Feed-level translation controls

The system MUST allow each feed to configure title translation and body translation independently.

#### Scenario: Create feed with translation toggles

- **GIVEN** a user submits `POST /api/feeds` with `titleTranslateEnabled=true` and `bodyTranslateEnabled=false`
- **WHEN** the feed is created successfully
- **THEN** the persisted feed includes both fields with the submitted values
- **AND** subsequent snapshot responses include these fields for UI gating

#### Scenario: Update feed translation controls

- **GIVEN** an existing feed
- **WHEN** the user submits `PATCH /api/feeds/:id` to update either translation toggle
- **THEN** the feed stores the updated values
- **AND** readers receive updated behavior without requiring schema fallback logic

### Requirement: Shared-or-dedicated translation provider settings

The system MUST support translation provider settings that either reuse AI provider settings or use dedicated translation settings, including a dedicated API key.

#### Scenario: Translation uses shared AI settings by default

- **GIVEN** `ai.translation.useSharedAi=true`
- **WHEN** a translation job starts
- **THEN** the job uses `ai.model`, `ai.apiBaseUrl`, and `ai_api_key`

#### Scenario: Translation uses dedicated settings when configured

- **GIVEN** `ai.translation.useSharedAi=false`
- **WHEN** a translation job starts
- **THEN** the job uses `ai.translation.model`, `ai.translation.apiBaseUrl`, and `translation_api_key`
- **AND** missing dedicated credentials are surfaced as explicit machine-readable errors

### Requirement: Title auto-translation for new articles

When title translation is enabled for a feed, the system MUST enqueue title translation for newly ingested articles and store translated title metadata.

#### Scenario: Auto translation succeeds

- **GIVEN** a feed with `titleTranslateEnabled=true`
- **AND** a new article is ingested with `title_original`
- **WHEN** title translation job succeeds
- **THEN** the article stores `title_zh`, `title_translation_model`, and `title_translated_at`
- **AND** list display title prefers `title_zh`

#### Scenario: Auto translation fails and retries

- **GIVEN** a feed with `titleTranslateEnabled=true`
- **WHEN** title translation job fails due to recoverable error
- **THEN** the system retries up to 3 attempts with exponential backoff
- **AND** after final failure, the system stores `title_translation_error` and keeps original title path available

### Requirement: Body translation must avoid full HTML pass-through

The system MUST extract translatable segments from sanitized DOM and translate segment text batches, rather than sending full HTML documents to the model.

#### Scenario: Segment extraction excludes code blocks

- **GIVEN** article HTML contains `p`, `td`, and `code/pre` content
- **WHEN** body translation runs
- **THEN** segments include text from `p` and table cells
- **AND** text inside `code/pre` is not translated

#### Scenario: Bilingual reconstruction output

- **GIVEN** translated segment text is returned successfully
- **WHEN** the reconstruction step completes
- **THEN** each segment renders original text above translated text in bilingual block markup
- **AND** link/media attributes remain unchanged

### Requirement: Translation mode UX and gating

The reader MUST keep `翻译/原文` button copy while translation mode renders immersive bilingual content and obeys feed-level body translation gating.

#### Scenario: Feed body translation disabled

- **GIVEN** feed has `bodyTranslateEnabled=false`
- **WHEN** user opens article view
- **THEN** translation trigger is disabled
- **AND** translation enqueue API responds with `body_translate_disabled` if called

#### Scenario: Translation mode displays bilingual title and body

- **GIVEN** article has `title_original`, `title_zh`, and `ai_translation_bilingual_html`
- **WHEN** user switches to translation mode
- **THEN** title renders original text on top and translated text below
- **AND** body renders bilingual blocks
- **AND** switching back to original mode shows original content only

