alter table app_settings
  add column if not exists translation_api_key text not null default '';
