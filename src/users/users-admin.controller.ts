import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  UpdateUserAdminDto,
  updateUserAdminSchema,
} from './dto/update-user-admin.dto';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MASTER', 'ADMIN', 'STAFF')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessão inválida');
    }
    return userId;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.getByIdForAdmin(id);
  }

  @Get()
  findAll() {
    return this.usersService.listForAdmin();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateUserAdminSchema))
    payload: UpdateUserAdminDto,
  ) {
    const actorUserId = this.requireUserId(session);
    return this.usersService.updateByIdForAdmin(id, payload, {
      actorUserId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
