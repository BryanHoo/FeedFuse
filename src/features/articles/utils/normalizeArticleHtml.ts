/** 修复订阅源 HTML 中遗留的 Markdown 加粗，保留现有 HTML 结构。 */
export function normalizeArticleHtml(html: string): string {
  if (!html.includes('**') || typeof DOMParser !== 'function') return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    // 代码示例和已有加粗保留原样；只处理文本节点，避免改写链接、图片地址等属性。
    if (node.parentElement?.closest('pre, code, kbd, samp, script, style, textarea, strong, b')) continue;
    if (node.data.includes('**')) textNodes.push(node);
  }

  let changed = false;
  for (const node of textNodes) {
    const pattern = /(?<![\\*])\*\*(?!\*)([^\r\n]+?)(?<!\\)\*\*(?!\*)/g;
    const fragment = doc.createDocumentFragment();
    let offset = 0;
    for (const match of node.data.matchAll(pattern)) {
      if (match[1].trim() !== match[1]) continue;
      fragment.append(doc.createTextNode(node.data.slice(offset, match.index)));
      const strong = doc.createElement('strong');
      // 必须通过 textContent 写入，保证 &lt;img ...&gt; 等正文仍是纯文本。
      strong.textContent = match[1];
      fragment.append(strong);
      offset = match.index + match[0].length;
    }
    if (offset === 0) continue;
    fragment.append(doc.createTextNode(node.data.slice(offset)));
    node.replaceWith(fragment);
    changed = true;
  }

  return changed ? doc.body.innerHTML : html;
}
