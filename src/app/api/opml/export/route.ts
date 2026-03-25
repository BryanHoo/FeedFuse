import { getPool } from '../../../../server/db/pool';
import { fail } from '../../../../server/http/apiResponse';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';
import { exportOpml } from '../../../../server/services/opmlService';

export async function GET() {
  try {
    const pool = getPool();
    const result = await exportOpml(pool);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'opml.export',
      source: 'app/api/opml/export',
      context: { fileName: result.fileName },
    });

    return new Response(result.xml, {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'content-disposition': `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    await writeUserOperationFailedLog(getPool(), {
      actionKey: 'opml.export',
      source: 'app/api/opml/export',
      err: error,
    });
    return fail(error);
  }
}
