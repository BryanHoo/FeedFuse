import { describe, expect, it, vi } from 'vitest';
import { clearApiErrorNotifier, notifyApiError, setApiErrorNotifier } from './apiErrorNotifier';

describe('apiErrorNotifier', () => {
  it('forwards messages to the registered notifier', () => {
    const notify = vi.fn();
    setApiErrorNotifier(notify);

    notifyApiError('订阅源已存在');

    expect(notify).toHaveBeenCalledWith('订阅源已存在');
    clearApiErrorNotifier();
  });

  it('stops forwarding after notifier is cleared', () => {
    const notify = vi.fn();
    setApiErrorNotifier(notify);
    clearApiErrorNotifier();

    notifyApiError('不会触发');

    expect(notify).not.toHaveBeenCalled();
  });
});
