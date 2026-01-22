import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DatabaseModule } from '../db/database.module';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { CloudinaryModule } from '../common/services/cloudinary.module';

@Module({
  imports: [DatabaseModule, AuditModule, CloudinaryModule],
  controllers: [EventsController],
  providers: [EventsService, RolesGuard],
})
export class EventsModule {}
