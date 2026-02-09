import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { DatabaseModule } from '../db/database.module';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { BirthdayEventsService } from '../events/birthday-events.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [FinancialController],
  providers: [FinancialService, RolesGuard, BirthdayEventsService],
  exports: [FinancialService],
})
export class FinancialModule {}
