import type { AuthenticatedPrincipal } from '../../modules/auth/access-token.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedPrincipal;
    }
  }
}

export {};
