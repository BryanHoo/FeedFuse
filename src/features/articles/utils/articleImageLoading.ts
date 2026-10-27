const PLACEHOLDER_ATTRIBUTE = 'data-article-image-placeholder';

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
  for (const image of images) prepareArticleImagePreview(image);
  // 键盘加载后焦点移交给图片预览入口或原链接，避免占位移除后丢失阅读位置。
  if (restoreFocus) {
    const focusTarget = images[0]?.closest<HTMLElement>('a[href]') ?? images[0];
    focusTarget?.focus();
  }
  return true;
}
