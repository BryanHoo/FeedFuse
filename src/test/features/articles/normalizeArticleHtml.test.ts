import { describe, expect, it } from 'vitest';
import { normalizeArticleHtml } from '@/features/articles/utils/normalizeArticleHtml';

describe('normalizeArticleHtml', () => {
  it('renders residual bold markers next to Chinese punctuation and text', () => {
    const html = normalizeArticleHtml(
      '<ol><li><p>**Ψ-0.6把感知语言几何拧进统一模型。**感知、语言，<strong>思维流</strong>。**下一帧预测。**视频</p></li></ol>',
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect([...doc.querySelectorAll('strong')].map((node) => node.textContent)).toEqual([
      'Ψ-0.6把感知语言几何拧进统一模型。', '思维流', '下一帧预测。',
    ]);
    expect(doc.querySelector('p')?.textContent).toBe(
      'Ψ-0.6把感知语言几何拧进统一模型。感知、语言，思维流。下一帧预测。视频',
    );
  });

  it('preserves code, attributes, escaped markers and unmatched markers', () => {
    const html = '<p>**未闭合 \\**字面量\\**</p><pre><code>**示例**</code></pre>' +
      '<p><code>**行内代码**</code><kbd>**快捷键**</kbd><a href="https://example.com/**path**">链接</a></p>';

    expect(normalizeArticleHtml(html)).toBe(html);
  });

  it('keeps encoded HTML as text instead of introducing executable markup', () => {
    const html = normalizeArticleHtml('<p>**&lt;img src=x onerror=alert(1)&gt;**正文</p>');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('strong')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelector('img')).toBeNull();
  });

  it('leaves existing HTML unchanged when there are no residual markers', () => {
    const html = '<p><strong>已加粗</strong><img src="/api/media/image?url=x&amp;sig=y" loading="lazy"></p>';
    expect(normalizeArticleHtml(html)).toBe(html);
    expect(normalizeArticleHtml('')).toBe('');
  });
});
