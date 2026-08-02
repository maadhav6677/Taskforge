import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../../config/env.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export class UnsupportedFileTypeError extends Error {}

export interface VerifiedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredFile extends VerifiedFile {
  storageKey: string;
}

export class FileStorage {
  private readonly root: string;

  public constructor(storagePath = env.TASK_FILE_STORAGE_PATH) {
    this.root = resolve(storagePath);
  }

  public async verify(file: Express.Multer.File): Promise<VerifiedFile> {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !allowedMimeTypes.has(detected.mime)) {
      throw new UnsupportedFileTypeError(
        'Only verified JPEG, PNG, WebP, and PDF files are allowed.',
      );
    }
    return {
      buffer: file.buffer,
      originalName: file.originalname.slice(0, 255),
      mimeType: detected.mime,
      sizeBytes: file.size,
    };
  }

  public async save(file: VerifiedFile): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const storageKey = randomUUID();
    await writeFile(this.pathFor(storageKey), file.buffer, { flag: 'wx', mode: 0o600 });
    return { ...file, storageKey };
  }

  public async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  public async remove(storageKey: string): Promise<void> {
    await unlink(this.pathFor(storageKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  public async sha256(storageKey: string): Promise<string> {
    return createHash('sha256')
      .update(await this.read(storageKey))
      .digest('hex');
  }

  private pathFor(storageKey: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageKey)
    ) {
      throw new Error('Invalid storage key.');
    }
    return resolve(this.root, storageKey);
  }
}
