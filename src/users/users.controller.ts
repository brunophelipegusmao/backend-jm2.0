import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import {
  assertValidImageUpload,
  MAX_IMAGE_SIZE_BYTES,
} from '../common/utils/image-upload';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import {
  CompleteProfileDto,
  completeProfileSchema,
} from './dto/complete-profile.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private requireUserId(session: UserSession | undefined) {
    const userId = session?.user?.id;
    if (!userId) {
      throw new BadRequestException('Sessão inválida');
    }
    return userId;
  }

  @Get('me')
  getMe(@Session() session: UserSession) {
    return this.usersService.getMe({ user: { id: this.requireUserId(session) } });
  }

  @Get('me/status')
  getStatus(@Session() session: UserSession) {
    return this.usersService.getProfileStatus({
      user: { id: this.requireUserId(session) },
    });
  }

  @Patch('me/profile')
  completeProfile(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(completeProfileSchema))
    completeProfileDto: CompleteProfileDto,
  ) {
    return this.usersService.completeProfile(
      { user: { id: this.requireUserId(session) } },
      completeProfileDto,
    );
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }),
  )
  uploadAvatar(
    @Session() session: UserSession,
    @Req() request: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = this.requireUserId(session);
    const validatedFile = assertValidImageUpload(file);
    const userAgentHeader = request.headers['user-agent'];
    return this.usersService.updateAvatar(userId, validatedFile, {
      actorUserId: userId,
      ip: request.ip,
      userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    });
  }
}
