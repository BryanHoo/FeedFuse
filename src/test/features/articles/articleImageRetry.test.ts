import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupArticleImageRetries } from '@/features/articles/utils/articleImageRetry';

describe('setupArticleImageRetries', () => {
  let root: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    root.innerHTML = '<img src="/api/media/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&amp;sig=signed" alt="配图">';
    document.body.append(root);
    cleanup = setupArticleImageRetries(root);
  });

  afterEach(() => {
    cleanup();
    root.remove();
    vi.useRealTimers();
  });

  it('retries transient failures with backoff while preserving signed parameters', () => {
    const image = root.querySelector('img')!;
    const original = image.getAttribute('src');
    image.dispatchEvent(new Event('error'));
    image.dispatchEvent(new Event('error'));

    vi.advanceTimersByTime(999);
    expect(image.getAttribute('src')).toBe(original);
    vi.advanceTimersByTime(1);
    const retried = new URL(image.src);
    expect(retried.searchParams.get('url')).toBe('https://example.com/a.jpg');
    expect(retried.searchParams.get('sig')).toBe('signed');
    expect(retried.searchParams.get('_retry')).toBe('1');

    image.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(1999);
    expect(image.src).toBe(retried.href);
    vi.advanceTimersByTime(1);
    expect(new URL(image.src).searchParams.get('_retry')).toBe('2');
  });

  it('stops after three retries instead of continuously requesting a broken image', () => {
    const image = root.querySelector('img')!;
    for (const delay of [1000, 2000, 4000]) {
      image.dispatchEvent(new Event('error'));
      vi.advanceTimersByTime(delay);
    }
    const finalSource = image.src;
    image.dispatchEvent(new Event('error'));
    vi.runAllTimers();

    expect(image.src).toBe(finalSource);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels scheduled retries when the image loads or the article unmounts', () => {
    const image = root.querySelector('img')!;
    const original = image.src;
    image.dispatchEvent(new Event('error'));
    image.dispatchEvent(new Event('load'));
    vi.runAllTimers();
    expect(image.src).toBe(original);

    image.dispatchEvent(new Event('error'));
    cleanup();
    vi.runAllTimers();
    expect(image.src).toBe(original);
  });

  it('does not rewrite external signed URLs or keep a failed srcset selected', () => {
    const image = root.querySelector('img')!;
    image.src = 'https://cdn.example.com/small.jpg?token=original';
    image.srcset = 'https://cdn.example.com/large.jpg?token=original 2x';
    Object.defineProperty(image, 'currentSrc', {
      configurable: true,
      value: 'https://cdn.example.com/large.jpg?token=original',
    });
    image.dispatchEvent(new Event('error'));
    vi.runAllTimers();

    expect(image.src).toBe('https://cdn.example.com/large.jpg?token=original');
    expect(image.hasAttribute('srcset')).toBe(false);
  });

  it('recovers images which failed before the effect subscribed', () => {
    cleanup();
    const image = root.querySelector('img')!;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 0 },
    });
    cleanup = setupArticleImageRetries(root);
    vi.runAllTimers();

    expect(new URL(image.src).searchParams.get('_retry')).toBe('1');
  });
});
