import { NextResponse } from 'next/server';
import { AppError } from './errors';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(err: unknown) {
  if (err instanceof AppError) {
    const error: { code: string; message: string; fields?: Record<string, string> } =
      {
        code: err.code,
        message: err.message,
      };
    if (err.fields) error.fields = err.fields;

    return NextResponse.json({ ok: false, error }, { status: err.status });
  }

  return NextResponse.json(
    { ok: false, error: { code: 'internal_error', message: '服务暂时不可用，请稍后重试' } },
    { status: 500 },
  );
}
