interface ReplayEvent {
  eventId: number | string;
  eventType: string;
  payload: unknown;
}

export function createEventStream(input: {
  signal: AbortSignal;
  afterEventId: number | string;
  initialEvents: ReplayEvent[];
  pollIntervalMs: number;
  sessionFinished: boolean;
  listEvents: (afterEventId: number | string) => Promise<ReplayEvent[]>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let lastEventId = input.afterEventId;
  let pending = input.initialEvents;
  let index = 0;
  let stopped = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  let lastHeartbeatAt = Date.now();

  const cleanup = () => {
    stopped = true;
    clearTimeout(timer);
    wake?.();
    input.signal.removeEventListener('abort', onAbort);
  };
  const close = () => {
    if (stopped) return;
    cleanup();
    controller.close();
  };
  const onAbort = () => close();

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      input.signal.addEventListener('abort', onAbort, { once: true });
      if (input.signal.aborted) close();
    },
    async pull() {
      // pull 自身串行执行；每次只排入一个事件，慢客户端停止读取时不会继续轮询数据库。
      while (!stopped) {
        while (index < pending.length) {
          const event = pending[index++];
          // 即使存储层或重连重放返回旧事件，游标也只能前进，不能再次追加同一段文本。
          // pg 将 bigserial 返回为字符串；使用 BigInt 比较，兼顾位数变化和超过安全整数的 ID。
          if (BigInt(event.eventId) <= BigInt(lastEventId)) continue;
          controller.enqueue(encoder.encode(
            `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\n\n`,
          ));
          lastEventId = event.eventId;
          if (event.eventType === 'session.completed' || event.eventType === 'session.failed') close();
          return;
        }
        if (input.sessionFinished && pending.length === 0) {
          close();
          return;
        }

        // 查询结束后才等待下一个周期；取消连接会同时唤醒等待，晚到的查询结果直接丢弃。
        await new Promise<void>((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, input.pollIntervalMs);
        });
        wake = undefined;
        if (stopped) return;
        try {
          pending = await input.listEvents(lastEventId);
          index = 0;
        } catch {
          // 短暂数据库错误保留当前游标，下个周期重试，避免丢失事件。
        }
        if (stopped) return;
        if (index >= pending.length && Date.now() - lastHeartbeatAt >= 15_000) {
          controller.enqueue(encoder.encode(': ping\n\n'));
          lastHeartbeatAt = Date.now();
          return;
        }
      }
    },
    cancel() {
      // 消费者取消后 controller 已被关闭，只清理资源，避免再次调用 close。
      cleanup();
    },
  }, { highWaterMark: 1 });
}

export const EVENT_STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

export function parseLastEventId(headerValue: string | null): string {
  if (!headerValue || !/^\d+$/.test(headerValue)) return '0';
  const id = BigInt(headerValue);
  // PostgreSQL bigint 为有符号 64 位，拒绝无法作为数据库游标使用的输入。
  return id <= 9223372036854775807n ? id.toString() : '0';
}
