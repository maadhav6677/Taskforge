import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../../config/env.js';

const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(['USER', 'ADMIN']),
  sid: z.string().uuid(),
});

export type AuthenticatedPrincipal = z.infer<typeof accessClaimsSchema>;

const signingKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const signAccessToken = async (principal: AuthenticatedPrincipal): Promise<string> =>
  new SignJWT({ role: principal.role, sid: principal.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(principal.sub)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
    .sign(signingKey);

export const verifyAccessToken = async (token: string): Promise<AuthenticatedPrincipal> => {
  const { payload } = await jwtVerify(token, signingKey, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  return accessClaimsSchema.parse(payload);
};
