alter table feeds
  add column if not exists title_translate_enabled boolean not null default false,
  add column if not exists body_translate_enabled boolean not null default false;
