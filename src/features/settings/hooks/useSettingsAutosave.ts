import { useEffect, useMemo, useState } from 'react';

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useSettingsAutosave(input: {
  draftVersion: number;
  saveDraft: () => Promise<{ ok: boolean }>;
  hasErrors: boolean;
  delayMs?: number;
}) {
  const { draftVersion, saveDraft, hasErrors, delayMs = 500 } = input;
  const [lastSavedVersion, setLastSavedVersion] = useState(0);
  const [lastResult, setLastResult] = useState<AutosaveStatus>('idle');

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
          setLastSavedVersion(targetVersion);
          setLastResult(result.ok ? 'saved' : 'error');
        })
        .catch(() => {
          if (!active) return;
          setLastSavedVersion(targetVersion);
          setLastResult('error');
        });
    }, delayMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draftVersion, hasErrors, saveDraft, delayMs]);

  const status = useMemo<AutosaveStatus>(() => {
    if (draftVersion === 0) {
      return 'idle';
    }

    if (hasErrors) {
      return 'error';
    }

    if (draftVersion > lastSavedVersion) {
      return 'saving';
    }

    return lastResult;
  }, [draftVersion, hasErrors, lastResult, lastSavedVersion]);

  return useMemo(() => ({ status }), [status]);
}
