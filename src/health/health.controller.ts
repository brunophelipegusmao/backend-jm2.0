import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HealthService } from './health.service';
import { CreateHealthDto, createHealthSchema } from './dto/create-health.dto';
import {
  ComputeBodyCompositionDto,
  computeBodyCompositionSchema,
} from './dto/compute-body-composition.dto';
import { UpdateHealthDto, updateHealthSchema } from './dto/update-health.dto';

@Controller('health')
@UseGuards(AuthGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessão inválida');
    }
    return userId;
  }

  @Get('me')
  findMe(@Session() session: UserSession) {
    return this.healthService.findMe(this.requireUserId(session));
  }

  @Post('me')
  upsertMe(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createHealthSchema))
    createHealthDto: CreateHealthDto,
  ) {
    return this.healthService.upsertForUser(
      this.requireUserId(session),
      createHealthDto,
    );
  }

  @Patch('me')
  updateMe(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateHealthSchema))
    updateHealthDto: UpdateHealthDto,
  ) {
    return this.healthService.updateForUser(
      this.requireUserId(session),
      updateHealthDto,
    );
  }

  @Delete('me')
  removeMe(@Session() session: UserSession) {
    return this.healthService.removeForUser(this.requireUserId(session));
  }

  @Post(':userId/body-composition/compute')
  computeBodyComposition(
    @Param('userId') userId: string,
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(computeBodyCompositionSchema))
    payload: ComputeBodyCompositionDto,
  ) {
    const sessionUserId = this.requireUserId(session);
    if (userId !== sessionUserId) {
      throw new ForbiddenException('Acesso negado');
    }
    return this.healthService.computeFromPayload(payload);
  }
}
