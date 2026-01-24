import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { ConfigModule } from '@nestjs/config';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
