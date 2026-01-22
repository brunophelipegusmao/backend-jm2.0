import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { DatabaseService } from './database.service';

const dbProvider = {
  provide: 'POSTGRES_POOL',
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const databaseUrl = configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    return neon(databaseUrl);
  },
};

const drizzleProvider = {
  provide: 'DRIZZLE_DB',
  inject: ['POSTGRES_POOL'],
  useFactory: (sql: ReturnType<typeof neon>) => drizzle(sql),
};

@Module({
  imports: [ConfigModule],
  providers: [dbProvider, drizzleProvider, DatabaseService],
  exports: [dbProvider, drizzleProvider, DatabaseService],
})
export class DatabaseModule {}
