import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/access-token.js';

describe('access tokens', () => {
  const principal = {
    sub: '67d5250d-e5bf-4401-b59a-47cc36a5c663',
    role: 'USER' as const,
    sid: 'ce283e48-9c74-449e-a221-9ce1064fe05e',
  };

  it('round-trips the allowlisted claims', async () => {
    const token = await signAccessToken(principal);
    await expect(verifyAccessToken(token)).resolves.toEqual(principal);
  });

  it('rejects a token signed with another key', async () => {
    const token = await signAccessToken(principal);
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await expect(verifyAccessToken(tampered)).rejects.toBeDefined();
  });
});
