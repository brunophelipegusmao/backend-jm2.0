import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { DatabaseModule } from '../db/database.module';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [PlansController],
  providers: [PlansService, RolesGuard],
})
export class PlansModule {}
