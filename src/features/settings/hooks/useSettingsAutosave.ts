import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveDraftResult } from '@/store/settingsStore';

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'invalid';

export function useSettingsAutosave(input: {
  draftVersion: number;
  saveDraft: () => Promise<SaveDraftResult>;
  hasErrors: boolean;
  delayMs?: number;
}) {
  const { draftVersion, saveDraft, hasErrors, delayMs = 500 } = input;
  const [lastSavedVersion, setLastSavedVersion] = useState(0);
  const [lastAttemptedVersion, setLastAttemptedVersion] = useState(0);
  const [lastResult, setLastResult] = useState<AutosaveStatus>('idle');
  const [saveResult, setSaveResult] = useState<SaveDraftResult | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryPendingRef = useRef(false);

  const retry = useCallback(() => {
    // 重试仅面向请求失败；字段错误需要先修改，防止无效请求或连点重复提交。
    if (hasErrors || lastResult !== 'error' || retryPendingRef.current) return;
    retryPendingRef.current = true;
    setLastResult('saving');
    setRetryAttempt((value) => value + 1);
  }, [hasErrors, lastResult]);

  useEffect(() => {
    if (draftVersion === 0 || hasErrors) {
      return;
    }

    const targetVersion = draftVersion;
    let active = true;
    const timer = window.setTimeout(() => {
      void saveDraft()
        .then((result) => {
          // 草稿已更新或组件已卸载时，旧请求不能再修改当前保存状态。
          if (!active) return;
          retryPendingRef.current = false;
          setLastAttemptedVersion(targetVersion);
          if (result.ok) setLastSavedVersion(targetVersion);
          setSaveResult(result);
          setLastResult(result.ok ? 'saved' : 'error');
        })
        .catch((err: unknown) => {
          if (!active) return;
          retryPendingRef.current = false;
          setLastAttemptedVersion(targetVersion);
          setSaveResult({ ok: false, err });
          setLastResult('error');
        });
    }, delayMs);

    return () => {
      active = false;
      retryPendingRef.current = false;
      window.clearTimeout(timer);
    };
  }, [draftVersion, hasErrors, saveDraft, delayMs, retryAttempt]);

  const status = useMemo<AutosaveStatus>(() => {
    if (draftVersion === 0) {
      return 'idle';
    }

    if (hasErrors) {
      return 'invalid';
    }

    if (draftVersion > lastAttemptedVersion) {
      return 'saving';
    }

    return lastResult;
  }, [draftVersion, hasErrors, lastResult, lastAttemptedVersion]);

  return useMemo(() => ({ status, retry, saveResult, lastSavedVersion }), [status, retry, saveResult, lastSavedVersion]);
}
