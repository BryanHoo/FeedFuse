const PLACEHOLDER_ATTRIBUTE = 'data-article-image-placeholder';
const LOADING_ATTRIBUTE = 'data-article-image-loading';

/** 在原图片（或 picture）外显示状态层，保留响应式候选、链接和预览事件目标。 */
export function showArticleImageLoading(image: HTMLImageElement, failed = false): void {
  let frame = image.closest<HTMLElement>(`[${LOADING_ATTRIBUTE}]`);
  if (!frame) {
    const original = image.closest('picture') ?? image;
    if (!original.parentNode) return;
    frame = document.createElement('span');
    frame.setAttribute(LOADING_ATTRIBUTE, '');
    frame.className = 'article-image-loading';
    // 有尺寸时按原比例预留区域；未知尺寸时由样式提供占位，避免下载期间高度塌陷。
    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    if (width > 0 && Number.isFinite(width)) {
      frame.style.setProperty('--article-image-width', `${width}px`);
      if (height > 0 && Number.isFinite(height)) {
        frame.style.aspectRatio = `${width} / ${height}`;
      }
    }
    original.replaceWith(frame);
    const status = document.createElement('span');
    status.className = 'article-image-loading-status';
    status.setAttribute('role', 'status');
    // 图形仅承担视觉反馈，读屏继续通过独立的状态文字了解加载进度。
    const skeleton = document.createElement('span');
    skeleton.className = 'article-image-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    frame.append(original, skeleton, status);
  }
  frame.setAttribute('aria-busy', String(!failed));
  frame.dataset.state = failed ? 'error' : 'loading';
  const status = frame.querySelector('.article-image-loading-status');
  if (status) status.textContent = failed ? '图片加载失败' : '图片加载中…';
}

/** 成功或卸载时移除临时布局，完整恢复原图的尺寸、样式及 picture 结构。 */
export function clearArticleImageLoading(image: HTMLImageElement): void {
  const frame = image.closest(`[${LOADING_ATTRIBUTE}]`);
  const original = image.closest('picture') ?? image;
  if (!frame) return;
  const focused = document.activeElement;
  const restoreFocus = focused instanceof HTMLElement && original.contains(focused);
  frame.replaceWith(original);
  // 移动 DOM 会丢失焦点，恢复键盘阅读位置且不触发额外滚动。
  if (restoreFocus) focused.focus({ preventScroll: true });
}

/** 统一补齐正文图片的预览入口；带链接的图片继续使用原链接。 */
export function prepareArticleImagePreview(image: HTMLImageElement): void {
  if (image.closest('a[href]')) return;
  const alt = image.alt.trim();
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute('aria-label', alt ? `查看大图：${alt}` : '查看大图');
  image.classList.add('cursor-zoom-in');
}

/** 在正文挂载前替换图片，确保 src、srcset 及 picture 候选均不会提前发起请求。 */
export function deferArticleImages(html: string): string {
  // 服务端没有 DOM 时不输出图片正文，避免在客户端接管前触发图片请求。
  if (typeof document === 'undefined') return '';

  // template 内容保持惰性；解析和暂存阶段都不创建活跃图片，也不执行资源加载。
  const root = document.createElement('template');
  root.innerHTML = html;
  for (const image of root.content.querySelectorAll('img')) {
    if (!root.content.contains(image)) continue;
    const original = image.closest('picture') ?? image;
    const placeholder = document.createElement('span');
    const alt = image.alt.trim();
    placeholder.setAttribute(PLACEHOLDER_ATTRIBUTE, '');
    placeholder.setAttribute('role', 'button');
    placeholder.tabIndex = 0;
    placeholder.setAttribute('aria-label', alt ? `加载图片：${alt}` : '加载图片');
    placeholder.title = alt || '点击加载图片';
    placeholder.className = 'not-prose my-1 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded border border-border bg-muted/50 px-2 py-1 align-middle text-xs font-normal text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '▧';
    placeholder.append(icon, document.createTextNode('点击加载图片'));

    const savedImage = document.createElement('template');
    original.replaceWith(placeholder);
    // 将整个 picture 一并保存，防止 source.srcset 绕过无图片模式，并保留全部原始属性。
    savedImage.content.append(original);
    placeholder.append(savedImage);
  }
  return root.innerHTML;
}

/** 仅还原被激活的占位；返回是否处理，以便调用方阻止外层链接和预览动作。 */
export function loadArticleImagePlaceholder(target: Element): boolean {
  const placeholder = target.closest(`[${PLACEHOLDER_ATTRIBUTE}]`);
  const savedImage = placeholder?.querySelector('template');
  if (!placeholder || !(savedImage instanceof HTMLTemplateElement)) return false;

  const images = Array.from(savedImage.content.querySelectorAll('img'));
  const restoreFocus = document.activeElement === placeholder;
  for (const image of images) image.loading = 'eager';
  placeholder.replaceWith(savedImage.content);
  for (const image of images) {
    prepareArticleImagePreview(image);
    if (!image.complete || image.naturalWidth === 0) showArticleImageLoading(image);
  }
  // 键盘加载后焦点移交给图片预览入口或原链接，避免占位移除后丢失阅读位置。
  if (restoreFocus) {
    const focusTarget = images[0]?.closest<HTMLElement>('a[href]') ?? images[0];
    focusTarget?.focus();
  }
  return true;
}
