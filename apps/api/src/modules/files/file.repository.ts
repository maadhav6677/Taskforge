import type { FileAttachment } from '../../generated/prisma/client.js';
import type { TaskforgePrismaClient } from '../../infrastructure/database/prisma.js';

export interface FileRecord {
  id: string;
  taskId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string | null;
  createdAt: Date;
}

const toRecord = (file: FileAttachment): FileRecord => ({ ...file });

export class FileRepository {
  public constructor(private readonly database: TaskforgePrismaClient) {}

  public async create(
    taskId: string,
    input: Omit<FileRecord, 'id' | 'taskId' | 'sha256' | 'createdAt'>,
  ): Promise<FileRecord> {
    return toRecord(
      await this.database.fileAttachment.create({
        data: {
          taskId,
          storageKey: input.storageKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
        },
      }),
    );
  }

  public async listForTask(taskId: string): Promise<FileRecord[]> {
    return (await this.database.fileAttachment.findMany({ where: { taskId } })).map(toRecord);
  }

  public async findOwnedById(ownerId: string, fileId: string): Promise<FileRecord | null> {
    const file = await this.database.fileAttachment.findFirst({
      where: { id: fileId, task: { ownerId, deletedAt: null } },
    });
    return file ? toRecord(file) : null;
  }

  public async setSha256(fileId: string, sha256: string): Promise<void> {
    await this.database.fileAttachment.update({ where: { id: fileId }, data: { sha256 } });
  }

  public async deleteForTask(taskId: string): Promise<void> {
    await this.database.fileAttachment.deleteMany({ where: { taskId } });
  }
}
