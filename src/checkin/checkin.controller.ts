import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AllowAnonymous,
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { BillingGuard } from '../financial/guards/billing.guard';
import { CheckinService } from './checkin.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CreateIdentifierCheckinDto } from './dto/create-identifier-checkin.dto';

@Controller('checkin')
@UseGuards(AuthGuard)
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessao invalida');
    }
    return userId;
  }

  @Post('me')
  @UseGuards(BillingGuard)
  createForMe(
    @Session() session: UserSession,
    @Body() createCheckinDto: CreateCheckinDto,
  ) {
    return this.checkinService.createForUser(
      this.requireUserId(session),
      createCheckinDto,
    );
  }

  @Post('identify')
  @AllowAnonymous()
  createByIdentifier(
    @Req() request: Request,
    @Body() createCheckinDto: CreateIdentifierCheckinDto,
  ) {
    const userAgentHeader = request.headers['user-agent'];
    return this.checkinService.createForIdentifier(createCheckinDto, {
      ip: request.ip,
      userAgent:
        typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    });
  }

  @Get('me/history')
  findMyHistory(@Session() session: UserSession) {
    return this.checkinService.findAll(this.requireUserId(session));
  }

  @Get('me')
  findMyLatest(@Session() session: UserSession) {
    return this.checkinService.findLatestForUser(this.requireUserId(session));
  }
}
