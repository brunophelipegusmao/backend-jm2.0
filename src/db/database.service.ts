import { Inject, Injectable } from '@nestjs/common';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type * as schema from '../drizzle/schema';

@Injectable()
export class DatabaseService {
  constructor(
    @Inject('DRIZZLE_DB')
    private readonly db: NeonHttpDatabase<typeof schema>,
    @Inject('POSTGRES_POOL') private readonly sql: any,
  ) {}

  get database(): NeonHttpDatabase<typeof schema> {
    return this.db;
  }

  private normalizeRawResult<T>(result: unknown): T[] {
    if (Array.isArray(result)) {
      return result as T[];
    }

    if (
      result &&
      typeof result === 'object' &&
      Array.isArray((result as { rows?: unknown[] }).rows)
    ) {
      return (result as { rows: T[] }).rows;
    }

    return [];
  }

  async rawQuery<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    // Prefer Drizzle for typed queries; use raw only when necessary and validate input.
    if (
      this.sql &&
      typeof this.sql === 'function' &&
      typeof (this.sql as { query?: unknown }).query === 'function'
    ) {
      const queryResult = await (
        this.sql as {
          query: (q: string, p?: unknown[]) => Promise<unknown>;
        }
      ).query(query, params);
      return this.normalizeRawResult<T>(queryResult);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const legacyResult = await this.sql(query, params);
    return this.normalizeRawResult<T>(legacyResult);
  }
}
