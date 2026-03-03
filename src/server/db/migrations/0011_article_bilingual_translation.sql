alter table articles
  add column if not exists title_original text not null default '',
  add column if not exists title_zh text null,
  add column if not exists title_translation_model text null,
  add column if not exists title_translation_attempts integer not null default 0,
  add column if not exists title_translation_error text null,
  add column if not exists title_translated_at timestamptz null,
  add column if not exists ai_translation_bilingual_html text null,
  add column if not exists ai_translation_segments_json jsonb null;
