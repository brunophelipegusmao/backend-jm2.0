import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../db/database.module';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { HealthAdminController } from './health-admin.controller';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [HealthController, HealthAdminController],
  providers: [HealthService, RolesGuard],
})
export class HealthModule {}
