/* eslint-disable @typescript-eslint/no-unsafe-return */
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async rawQuery(query: string, params: any[] = []) {
    // Prefer Drizzle for typed queries; use raw only when necessary and validate input.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return this.sql(query, params);
  }
}
