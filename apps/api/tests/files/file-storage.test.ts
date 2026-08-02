import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { FileStorage, UnsupportedFileTypeError } from '../../src/modules/files/file.storage.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const multerFile = (buffer: Buffer, originalname: string): Express.Multer.File => ({
  fieldname: 'attachments',
  originalname,
  encoding: '7bit',
  mimetype: 'application/octet-stream',
  size: buffer.length,
  destination: '',
  filename: '',
  path: '',
  buffer,
  stream: Readable.from(buffer),
});

describe('private file storage', () => {
  let root: string;
  let storage: FileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'taskforge-files-'));
    storage = new FileStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('trusts detected bytes, stores under an opaque key, and hashes stored content', async () => {
    const verified = await storage.verify(multerFile(png, '../profile.svg'));
    const stored = await storage.save(verified);

    expect(verified.mimeType).toBe('image/png');
    expect(stored.storageKey).toMatch(/^[0-9a-f-]{36}$/);
    await expect(storage.read(stored.storageKey)).resolves.toEqual(png);
    await expect(storage.sha256(stored.storageKey)).resolves.toBe(
      '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460',
    );
  });

  it('rejects unsupported bytes and traversal-style storage keys', async () => {
    await expect(
      storage.verify(multerFile(Buffer.from('<svg><script /></svg>'), 'picture.png')),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
    await expect(storage.read('../outside')).rejects.toThrow('Invalid storage key');
  });
});
