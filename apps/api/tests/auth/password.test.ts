import { hashPassword, verifyPassword } from '../../src/modules/auth/password.js';

describe('password security', () => {
  it('hashes with Argon2id and verifies only the matching password', async () => {
    const hash = await hashPassword('Correct horse battery staple!');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'Correct horse battery staple!')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'incorrect-password')).resolves.toBe(false);
  });
});
