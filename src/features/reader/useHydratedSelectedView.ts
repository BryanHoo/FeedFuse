import { useSyncExternalStore } from 'react';
import type { ViewType } from '../../types';

const PRE_HYDRATION_VIEW_ID: ViewType = '__pre_hydration__';
const noopSubscribe = () => () => {};

export function useHydratedSelectedView(
  selectedView: ViewType,
  initialSelectedView?: ViewType,
): ViewType {
  // Keep SSR and the first client paint aligned before the store-selected view takes over.
  const selectionHydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return selectionHydrated ? selectedView : (initialSelectedView ?? PRE_HYDRATION_VIEW_ID);
}
