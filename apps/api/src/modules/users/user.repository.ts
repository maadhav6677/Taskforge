import type { Role } from '../../generated/prisma/enums.js';
import type { User } from '../../generated/prisma/client.js';
import type { TaskforgePrismaClient } from '../../infrastructure/database/prisma.js';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCredentialsRecord extends UserRecord {
  passwordHash: string;
}

export class UserEmailConflictError extends Error {
  public constructor() {
    super('A user with this email already exists.');
    this.name = 'UserEmailConflictError';
  }
}

const toUserRecord = (user: User): UserRecord => ({
  id: user.id,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export class UserRepository {
  public constructor(private readonly database: TaskforgePrismaClient) {}

  public async create(email: string, passwordHash: string): Promise<UserRecord> {
    try {
      const user = await this.database.user.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash,
          role: 'USER',
        },
      });
      return toUserRecord(user);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new UserEmailConflictError();
      }
      throw error;
    }
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const user = await this.database.user.findUnique({ where: { id } });
    return user ? toUserRecord(user) : null;
  }

  public async findCredentialsByEmail(email: string): Promise<UserCredentialsRecord | null> {
    const user = await this.database.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    return user ? { ...toUserRecord(user), passwordHash: user.passwordHash } : null;
  }
}
