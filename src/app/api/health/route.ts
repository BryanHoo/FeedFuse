import { NextResponse } from 'next/server';
import { getHealthReport } from '@/server/infra/health/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getHealthReport();
  const healthy = data.status === 'ok';
  // 保留统一响应外壳；失败时仍携带各探测项，便于监控定位后台停摆。
  return NextResponse.json({ ok: healthy, data }, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
