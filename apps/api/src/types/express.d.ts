import type { UserContext } from "./middleware/auth.js";

declare global {
  namespace Express {
    interface Request {
      ctx?: UserContext;
    }
  }
}

export {};
