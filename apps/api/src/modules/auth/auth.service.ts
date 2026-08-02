import { UserEmailConflictError } from '../users/user.repository.js';
import type { UserRecord, UserRepository } from '../users/user.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import type { RefreshSession, RefreshSessionStore } from './refresh-session.store.js';

export class EmailAlreadyRegisteredError extends Error {}
export class InvalidCredentialsError extends Error {}

export interface AuthResult {
  user: UserRecord;
  session: RefreshSession;
}

export class AuthService {
  public constructor(
    private readonly users: UserRepository,
    private readonly sessions: RefreshSessionStore,
  ) {}

  public async register(email: string, password: string): Promise<AuthResult> {
    const passwordHash = await hashPassword(password);
    let user: UserRecord;
    try {
      user = await this.users.create(email, passwordHash);
    } catch (error) {
      if (error instanceof UserEmailConflictError) throw new EmailAlreadyRegisteredError();
      throw error;
    }
    const session = await this.sessions.create(user.id, user.role);
    return { user, session };
  }

  public async login(email: string, password: string): Promise<AuthResult> {
    const credentials = await this.users.findCredentialsByEmail(email);
    if (!credentials || !(await verifyPassword(credentials.passwordHash, password))) {
      throw new InvalidCredentialsError();
    }
    const session = await this.sessions.create(credentials.id, credentials.role);
    const user: UserRecord = {
      id: credentials.id,
      email: credentials.email,
      role: credentials.role,
      createdAt: credentials.createdAt,
      updatedAt: credentials.updatedAt,
    };
    return { user, session };
  }

  public async refresh(token: string): Promise<RefreshSession> {
    return this.sessions.rotate(token);
  }

  public async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }
}
