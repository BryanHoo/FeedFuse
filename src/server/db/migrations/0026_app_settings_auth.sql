alter table app_settings
  add column if not exists auth_password_hash text not null default '',
  add column if not exists auth_session_secret text not null default encode(gen_random_bytes(32), 'hex');
