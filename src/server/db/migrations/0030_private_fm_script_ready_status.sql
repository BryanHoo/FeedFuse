alter table private_fm_episodes
  drop constraint if exists private_fm_episodes_status_check;

alter table private_fm_episodes
  add constraint private_fm_episodes_status_check check (
    status in ('queued', 'running', 'script_ready', 'succeeded', 'failed')
  );
