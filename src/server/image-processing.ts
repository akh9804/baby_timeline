import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

export class ImageProcessingError extends Error {
  constructor(cause: unknown) {
    super('Uploaded image could not be decoded or resized', { cause });
    this.name = 'ImageProcessingError';
  }
}

export async function createImageThumbnail(sourcePath: string, thumbnailPath: string): Promise<void> {
  let thumbnail: Buffer;

  try {
    thumbnail = await sharp(sourcePath)
      .rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    throw new ImageProcessingError(error);
  }

  await mkdir(dirname(thumbnailPath), { recursive: true });
  await writeFile(thumbnailPath, thumbnail, { flag: 'wx' });
}
