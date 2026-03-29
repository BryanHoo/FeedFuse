import { ok } from '@/server/http/apiResponse';
import { serializeExpiredSessionCookie } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return ok(
    { authenticated: false },
    {
      headers: {
        'set-cookie': serializeExpiredSessionCookie(),
      },
    },
  );
}
