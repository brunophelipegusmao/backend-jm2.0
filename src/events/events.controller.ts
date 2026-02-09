import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AllowAnonymous,
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { z } from 'zod';
import { auth } from '../auth';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  assertValidImageUpload,
  MAX_IMAGE_SIZE_BYTES,
} from '../common/utils/image-upload';
import { EventsService } from './events.service';
import { CreateEventDto, createEventSchema } from './dto/create-event.dto';
import {
  EventRegistrationDto,
  eventRegistrationSchema,
} from './dto/event-registration.dto';
import {
  EventGuestRegistrationDto,
  eventGuestRegistrationSchema,
} from './dto/event-guest-registration.dto';
import {
  EventsQueryDto,
  PublicBirthdaysQueryDto,
  PublicEventsQueryDto,
  eventsQuerySchema,
  publicBirthdaysQuerySchema,
  publicEventsQuerySchema,
} from './dto/events-query.dto';
import { UpdateEventDto, updateEventSchema } from './dto/update-event.dto';
import {
  ConfirmRegistrationDto,
  confirmRegistrationSchema,
} from './dto/confirm-registration.dto';

const normalizeQuery = (query: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(
    Object.entries(query).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );

const parseQuery = <T>(
  schema: z.ZodSchema<T>,
  query: Record<string, string | string[] | undefined>,
) => {
  const normalized = normalizeQuery(query);
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    throw new BadRequestException('Query invalida');
  }
  return parsed.data;
};

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  private async resolveSessionUserId(
    session: UserSession | undefined,
    request?: Request,
  ) {
    if (session?.user?.id) {
      return session.user.id;
    }
    if (!request) {
      return null;
    }

    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(','));
          continue;
        }
        if (typeof value === 'string') {
          headers.set(key, value);
        }
      }
      const resolved = (await auth.api.getSession({ headers })) as {
        user?: { id?: string };
      } | null;
      return resolved?.user?.id ?? null;
    } catch {
      return null;
    }
  }

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessao invalida');
    }
    return userId;
  }

  private buildAuditContext(
    session: UserSession | undefined,
    request: Request,
  ) {
    const actorUserId = this.requireUserId(session);
    return {
      actorUserId,
      ip: request.ip,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
    };
  }

  @Get('public')
  @AllowAnonymous()
  listPublic(@Query() query: Record<string, string | string[] | undefined>) {
    const filters = parseQuery<PublicEventsQueryDto>(
      publicEventsQuerySchema,
      query,
    );
    return this.eventsService.listPublic(filters);
  }

  @Get('calendar')
  @AllowAnonymous()
  listCalendar(@Query() query: Record<string, string | string[] | undefined>) {
    const filters = parseQuery<PublicEventsQueryDto>(
      publicEventsQuerySchema,
      query,
    );
    return this.eventsService.listCalendar(filters);
  }

  @Get('public/cards')
  @AllowAnonymous()
  listPublicCards(
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const filters = parseQuery<PublicEventsQueryDto>(
      publicEventsQuerySchema,
      query,
    );
    return this.eventsService.listPublicCards(filters);
  }

  @Get('public/birthdays')
  @AllowAnonymous()
  listPublicBirthdays(
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    const filters = parseQuery<PublicBirthdaysQueryDto>(
      publicBirthdaysQuerySchema,
      query,
    );
    return this.eventsService.listPublicBirthdays(filters);
  }

  @Get('public/:slug')
  @AllowAnonymous()
  getPublicEvent(@Param('slug') slug: string) {
    return this.eventsService.getPublicBySlug(slug);
  }

  @Post('public/:slug/register')
  @AllowAnonymous()
  async registerPublic(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(eventRegistrationSchema))
    payload: EventRegistrationDto,
    @Session() session?: UserSession,
    @Req() request?: Request,
  ) {
    const userId = await this.resolveSessionUserId(session, request);
    const userAgentHeader = request?.headers['user-agent'];
    return this.eventsService.registerPublic(
      slug,
      payload,
      {
        actorUserId: userId ?? null,
        ip: request?.ip,
        userAgent:
          typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
      },
      userId ?? null,
    );
  }

  @Post('public/:slug/register-guest')
  @AllowAnonymous()
  registerGuest(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(eventGuestRegistrationSchema))
    payload: EventGuestRegistrationDto,
    @Req() request: Request,
  ) {
    const userAgentHeader = request.headers['user-agent'];
    return this.eventsService.registerGuestForEvent(slug, payload, {
      actorUserId: null,
      ip: request.ip,
      userAgent:
        typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    });
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post()
  create(
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(createEventSchema))
    createEventDto: CreateEventDto,
  ) {
    return this.eventsService.create(
      createEventDto,
      this.requireUserId(session),
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Get()
  findAll(@Query() query: Record<string, string | string[] | undefined>) {
    const filters = parseQuery<EventsQueryDto>(eventsQuerySchema, query);
    return this.eventsService.findAll(filters);
  }

  @UseGuards(AuthGuard)
  @Get('me/registrations')
  listMyRegistrations(@Session() session: UserSession) {
    return this.eventsService.listMyRegistrations(this.requireUserId(session));
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateEventSchema))
    updateEventDto: UpdateEventDto,
  ) {
    return this.eventsService.update(
      id,
      updateEventDto,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.remove(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.restore(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.publish(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/unpublish')
  unpublish(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.unpublish(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.cancel(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/uncancel')
  uncancel(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.uncancel(
      id,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  @Post(':id/thumbnail')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }),
  )
  uploadThumbnail(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const validatedFile = assertValidImageUpload(file);
    return this.eventsService.updateThumbnail(
      id,
      validatedFile,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF', 'COACH')
  @Get(':id/registrations')
  listRegistrations(@Param('id') id: string) {
    return this.eventsService.listRegistrations(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF', 'COACH')
  @Post(':id/registrations/:registrationId/cancel')
  cancelRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Session() session: UserSession,
    @Req() request: Request,
  ) {
    return this.eventsService.cancelRegistration(
      id,
      registrationId,
      this.buildAuditContext(session, request),
    );
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF', 'COACH')
  @Post(':id/registrations/:registrationId/confirm')
  confirmRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Session() session: UserSession,
    @Req() request: Request,
    @Body(new ZodValidationPipe(confirmRegistrationSchema))
    payload: ConfirmRegistrationDto,
  ) {
    return this.eventsService.confirmRegistration(
      id,
      registrationId,
      payload,
      this.buildAuditContext(session, request),
    );
  }
}
