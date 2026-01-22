import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../db/database.module';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersAdminController } from './users-admin.controller';
import { CloudinaryModule } from '../common/services/cloudinary.module';

@Module({
  imports: [DatabaseModule, AuditModule, CloudinaryModule],
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, RolesGuard],
})
export class UsersModule {}
