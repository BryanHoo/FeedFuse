import { useEffect } from 'react';
import { clearApiErrorNotifier, setApiErrorNotifier } from '../../lib/apiErrorNotifier';
import { useNotify } from './useNotify';

export function ApiNotificationBridge() {
  const notify = useNotify();

  useEffect(() => {
    setApiErrorNotifier((message) => notify.error(message));

    return () => {
      clearApiErrorNotifier();
    };
  }, [notify]);

  return null;
}
