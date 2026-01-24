import { AllowAnonymous, AuthGuard, Session, UserSession } from '@thallesp/nestjs-better-auth';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SystemSettingsService, SystemSettingsResponse } from './system-settings.service';
import { UpdateSystemSettingsDto, updateSystemSettingsSchema } from './dto/update-system-settings.dto';

@Controller('system-settings')
@UseGuards(AuthGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @AllowAnonymous()
  getSettings(): Promise<SystemSettingsResponse> {
    return this.systemSettingsService.getSettings();
  }

  @Patch()
  updateSettings(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateSystemSettingsSchema))
    payload: UpdateSystemSettingsDto,
  ): Promise<SystemSettingsResponse> {
    return this.systemSettingsService.updateSettings(session?.user?.role, payload);
  }
}
