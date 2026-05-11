import { requireApiSession } from '@/server/auth/session';
import { z } from 'zod';
import { getPool } from '../../../../../../../server/db/pool';
import { fail } from '../../../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../../../server/http/idSchemas';
import { getPrivateFmEpisodeById } from '../../../../../../../server/repositories/privateFmRepo';
import { readPrivateFmAudioPart } from '../../../../../../../server/private-fm/mediaStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  episodeId: numericIdSchema,
  part: z.union([z.literal('full'), z.coerce.number().int().min(0)]),
});

function mimeFromFormat(format: string | null): string {
  if (format === 'wav') return 'audio/wav';
  if (format === 'flac') return 'audio/flac';
  if (format === 'opus') return 'audio/opus';
  if (format === 'pcm') return 'audio/L16';
  return 'audio/mpeg';
}

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ episodeId: string; part: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }

    const episode = await getPrivateFmEpisodeById(getPool(), parsed.data.episodeId);
    const relativePath = parsed.data.part === 'full'
      ? episode?.mergedAudioPath
      : episode?.audioPaths[parsed.data.part];
    if (!episode || episode.status !== 'succeeded' || !relativePath) {
      return fail(new NotFoundError('Private FM audio not found'));
    }

    const bytes = await readPrivateFmAudioPart(relativePath);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        'content-type': mimeFromFormat(episode.responseFormat),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return fail(err);
  }
}
