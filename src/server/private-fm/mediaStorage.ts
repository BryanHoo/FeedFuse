import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const DEFAULT_MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
const execFileAsync = promisify(execFile);

export function getPrivateFmMediaRoot(): string {
  return process.env.FEEDFUSE_MEDIA_DIR?.trim() || DEFAULT_MEDIA_DIR;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function resolvePrivateFmMediaPath(relativePath: string): string {
  const root = path.resolve(getPrivateFmMediaRoot());
  const resolved = path.resolve(root, normalizeRelativePath(relativePath));

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid private FM media path');
  }

  return resolved;
}

export async function writePrivateFmAudioPart(input: {
  episodeId: string;
  partIndex: number;
  extension: string;
  bytes: Buffer;
}): Promise<string> {
  const safeExtension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  const relativePath = `private-fm/${input.episodeId}/${String(input.partIndex).padStart(3, '0')}.${safeExtension}`;
  const absolutePath = resolvePrivateFmMediaPath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);
  return relativePath;
}

function quoteFfmpegConcatPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`;
}

export async function mergePrivateFmAudioParts(input: {
  episodeId: string;
  audioPaths: string[];
  extension: string;
}): Promise<string> {
  if (input.audioPaths.length === 0) {
    throw new Error('Private FM audio merge failed: no audio parts');
  }

  const safeExtension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  const outputRelativePath = `private-fm/${input.episodeId}/full.${safeExtension}`;
  const outputAbsolutePath = resolvePrivateFmMediaPath(outputRelativePath);
  await mkdir(path.dirname(outputAbsolutePath), { recursive: true });

  if (input.audioPaths.length === 1) {
    await copyFile(resolvePrivateFmMediaPath(input.audioPaths[0]), outputAbsolutePath);
    return outputRelativePath;
  }

  const listRelativePath = `private-fm/${input.episodeId}/concat-list.txt`;
  const listAbsolutePath = resolvePrivateFmMediaPath(listRelativePath);
  const listContent = input.audioPaths
    .map((audioPath) => `file ${quoteFfmpegConcatPath(resolvePrivateFmMediaPath(audioPath))}`)
    .join('\n');

  await writeFile(listAbsolutePath, `${listContent}\n`, 'utf8');
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listAbsolutePath,
      '-c',
      'copy',
      outputAbsolutePath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Private FM audio merge failed: ${message}`);
  } finally {
    await rm(listAbsolutePath, { force: true });
  }

  return outputRelativePath;
}

export async function readPrivateFmAudioPart(relativePath: string): Promise<Buffer> {
  return readFile(resolvePrivateFmMediaPath(relativePath));
}

export async function deletePrivateFmAudioPaths(relativePaths: string[]): Promise<void> {
  await Promise.allSettled(
    relativePaths
      .filter((relativePath) => relativePath.trim().length > 0)
      .map((relativePath) => rm(resolvePrivateFmMediaPath(relativePath), { force: true })),
  );
}
