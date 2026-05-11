alter table private_fm_episodes
  add column if not exists merged_audio_path text null;
