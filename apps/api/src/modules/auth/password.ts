import { argon2id, hash, verify } from 'argon2';

const passwordHashOptions = {
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export const hashPassword = async (password: string): Promise<string> =>
  hash(password, passwordHashOptions);

export const verifyPassword = async (passwordHash: string, password: string): Promise<boolean> => {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
};
