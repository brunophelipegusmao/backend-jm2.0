import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
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
}
