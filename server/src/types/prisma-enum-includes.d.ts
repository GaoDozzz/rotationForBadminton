import type { EventStatus } from '../generated/prisma/client';

declare global {
  interface Array<T> {
    /** Prisma generates one wide enum union while literal arrays infer a narrow subset. */
    includes(searchElement: T | EventStatus, fromIndex?: number): boolean;
  }
}

export {};
