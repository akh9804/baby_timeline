import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const thumbnailTimeoutMs = 20_000;
const maxErrorOutputLength = 4_000;

export async function createVideoThumbnail(sourcePath: string, thumbnailPath: string): Promise<void> {
  await mkdir(dirname(thumbnailPath), { recursive: true });

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      const childProcess = spawn(
        ffmpegPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          sourcePath,
          '-ss',
          '0.5',
          '-frames:v',
          '1',
          '-vf',
          'scale=480:480:force_original_aspect_ratio=decrease',
          '-an',
          '-q:v',
          '4',
          '-y',
          thumbnailPath,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let errorOutput = '';
      let settled = false;
      const timeout = setTimeout(() => {
        childProcess.kill('SIGKILL');
      }, thumbnailTimeoutMs);

      childProcess.stderr.setEncoding('utf8');
      childProcess.stderr.on('data', (chunk: string) => {
        errorOutput = `${errorOutput}${chunk}`.slice(-maxErrorOutputLength);
      });

      childProcess.once('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      childProcess.once('close', (code, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        if (code === 0) {
          resolve();
        } else if (signal === 'SIGKILL') {
          reject(new Error(`FFmpeg exceeded the ${thumbnailTimeoutMs}ms thumbnail limit`));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput.trim() || 'unknown error'}`));
        }
      });
    });

    const thumbnail = await stat(thumbnailPath);

    if (thumbnail.size === 0) {
      throw new Error('FFmpeg produced an empty video thumbnail');
    }
  } catch (error) {
    await rm(thumbnailPath, { force: true });
    throw error;
  }
}
