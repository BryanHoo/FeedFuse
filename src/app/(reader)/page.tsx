import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/server/auth/session';
import ReaderApp from './ReaderApp';
import type { ViewType } from '../../types';

interface ReaderPageProps {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}

function normalizeViewSearchParam(input: string | string[] | undefined): ViewType | undefined {
  const rawValue = Array.isArray(input) ? input[0] : input;
  const normalized = rawValue?.trim();
  return normalized ? normalized : undefined;
}

export default async function ReaderPage({ searchParams }: ReaderPageProps = {}) {
  if (!(await isAuthenticated())) {
    redirect('/login');
  }

  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : undefined;

  return (
    <ReaderApp
      renderedAt={new Date().toISOString()}
      initialSelectedView={normalizeViewSearchParam(resolvedSearchParams?.view)}
    />
  );
}
