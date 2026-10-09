// 合并细碎文本，但首段立即送出；后续批次最长等待 250ms，且不会因上游暂时停顿而滞留。
export async function* batchTextDeltas(source: AsyncIterable<string>): AsyncGenerator<string> {
  const iterator = source[Symbol.asyncIterator]();
  let next = iterator.next();
  let buffer = '';
  let first = true;
  let deadline = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: IteratorResult<string> | null;
      try {
        result = buffer
          ? await Promise.race([
              next,
              new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
              }),
            ])
          : await next;
      } catch (err) {
        // 上游失败前已收到的文本仍需交给 worker，失败态才能保存完整的可恢复草稿。
        if (buffer) yield buffer;
        throw err;
      } finally {
        clearTimeout(timer);
      }
      if (result === null) {
        yield buffer;
        buffer = '';
        continue;
      }
      if (result.done) {
        if (buffer) yield buffer;
        return;
      }
      if (result.value) {
        if (!buffer) deadline = Date.now() + 250;
        buffer += result.value;
        if (first || buffer.length >= 2048 || Date.now() >= deadline) {
          first = false;
          yield buffer;
          buffer = '';
        }
      }
      // 始终只读取一个 next；计时器到期时保留这个请求，避免同时消费上游迭代器。
      next = iterator.next();
    }
  } finally {
    await iterator.return?.();
  }
}
