import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { ConfigModule } from '@nestjs/config';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { CloudinaryModule } from '../common/services/cloudinary.module';

@Module({
  imports: [DatabaseModule, ConfigModule, CloudinaryModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
