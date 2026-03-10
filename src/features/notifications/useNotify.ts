import { toast } from '../toast/toast';

export function useNotify() {
  return {
    success: toast.success,
    info: toast.info,
    error: toast.error,
    dismiss: toast.dismiss,
  };
}
