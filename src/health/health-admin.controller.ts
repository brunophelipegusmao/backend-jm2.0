import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createHealthSchema, CreateHealthDto } from './dto/create-health.dto';
import { updateHealthSchema, UpdateHealthDto } from './dto/update-health.dto';
import { HealthService } from './health.service';

@Controller('admin/health')
@UseGuards(AuthGuard, RolesGuard)
@Roles('MASTER', 'ADMIN', 'STAFF')
export class HealthAdminController {
  constructor(private readonly healthService: HealthService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessão inválida');
    }
    return userId;
  }

  @Get(':userId')
  findForUser(@Param('userId') userId: string) {
    return this.healthService.findByUserIdForAdmin(userId);
  }

  @Put(':userId')
  upsertForUser(
    @Param('userId') userId: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createHealthSchema))
    payload: CreateHealthDto,
  ) {
    const actorUserId = this.requireUserId(session);
    return this.healthService.upsertForUserAdmin(userId, payload, {
      actorUserId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Patch(':userId')
  updateForUser(
    @Param('userId') userId: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateHealthSchema))
    payload: UpdateHealthDto,
  ) {
    const actorUserId = this.requireUserId(session);
    return this.healthService.updateForUserAdmin(userId, payload, {
      actorUserId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
