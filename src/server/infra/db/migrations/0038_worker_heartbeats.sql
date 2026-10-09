-- 心跳属于基础设施运行状态；每个进程独立记录，不关联用户私有数据。
create table if not exists worker_heartbeats (
  worker_id text primary key,
  last_seen_at timestamptz not null
);

create index if not exists worker_heartbeats_last_seen_at_idx
  on worker_heartbeats (last_seen_at desc);
