import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 一个容器运行一个 Worker；探测进程读取本地实例标识，避免被其他容器的心跳掩盖。
export const WORKER_IDENTITY_PATH = join(tmpdir(), 'feedfuse-worker-id');
