export {};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string };
  }
}