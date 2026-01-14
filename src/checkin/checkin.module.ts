import { Module } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';
import { DatabaseModule } from '../db/database.module';
import { BillingGuard } from '../financial/guards/billing.guard';
import { AuditModule } from '../audit/audit.module';
import { AnonymousCheckinRateLimiter } from './anonymous-checkin-rate-limiter';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [CheckinController],
  providers: [CheckinService, BillingGuard, AnonymousCheckinRateLimiter],
})
export class CheckinModule {}
