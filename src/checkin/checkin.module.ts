import { Module } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';
import { DatabaseModule } from '../db/database.module';
import { BillingGuard } from '../financial/guards/billing.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [CheckinController],
  providers: [CheckinService, BillingGuard],
})
export class CheckinModule {}
