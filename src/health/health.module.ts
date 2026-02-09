import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../db/database.module';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { HealthAdminController } from './health-admin.controller';
import { BirthdayEventsService } from '../events/birthday-events.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [HealthController, HealthAdminController],
  providers: [HealthService, RolesGuard, BirthdayEventsService],
})
export class HealthModule {}
