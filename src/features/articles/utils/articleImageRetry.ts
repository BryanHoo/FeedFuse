const RETRY_DELAYS_MS = [1000, 2000, 4000];

function getRetrySource(source: string, attempt: number): string {
  const url = new URL(source, window.location.href);
  if (url.origin === window.location.origin && url.pathname === '/api/media/image') {
    // 仅为本站代理追加缓存区分参数；签名覆盖的 url/w/h/q 保持原值，外部签名地址不改写。
    url.searchParams.set('_retry', String(attempt));
    return `${url.pathname}${url.search}`;
  }
  return source;
}

/** 为正文图片提供有上限的退避重试，返回正文切换或卸载时的清理函数。 */
export function setupArticleImageRetries(container: HTMLElement): () => void {
  const attempts = new WeakMap<HTMLImageElement, number>();
  const timers = new Map<HTMLImageElement, number>();

  const cancelRetry = (image: HTMLImageElement) => {
    const timer = timers.get(image);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(image);
  };

  const scheduleRetry = (image: HTMLImageElement) => {
    const attempt = attempts.get(image) ?? 0;
    const source = image.currentSrc || image.getAttribute('src');
    if (!source || attempt >= RETRY_DELAYS_MS.length || timers.has(image)) return;

    const timer = window.setTimeout(() => {
      timers.delete(image);
      if (!container.contains(image)) return;
      attempts.set(image, attempt + 1);
      // srcset 优先级高于 src；失败后使用浏览器已选中的地址，避免重试一直命中旧候选。
      image.removeAttribute('srcset');
      image.removeAttribute('src');
      image.setAttribute('src', getRetrySource(source, attempt + 1));
    }, RETRY_DELAYS_MS[attempt]);
    timers.set(image, timer);
  };

  const onError = (event: Event) => {
    if (event.target instanceof HTMLImageElement) scheduleRetry(event.target);
  };
  const onLoad = (event: Event) => {
    if (event.target instanceof HTMLImageElement) cancelRetry(event.target);
  };

  // img 的 load/error 不冒泡，使用捕获监听覆盖正文中的所有图片（包括被链接包裹的图片）。
  container.addEventListener('error', onError, true);
  container.addEventListener('load', onLoad, true);
  for (const image of container.querySelectorAll('img')) {
    // 缓存命中或快速失败可能早于 React effect，安装监听时补查已失败的图片。
    if (image.complete && image.naturalWidth === 0) scheduleRetry(image);
  }

  return () => {
    container.removeEventListener('error', onError, true);
    container.removeEventListener('load', onLoad, true);
    for (const image of timers.keys()) cancelRetry(image);
  };
}
