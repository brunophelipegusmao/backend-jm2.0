import {
  AllowAnonymous,
  AuthGuard,
  Session,
  UserSession,
} from '@thallesp/nestjs-better-auth';
import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  assertValidImageUpload,
  MAX_IMAGE_SIZE_BYTES,
} from '../common/utils/image-upload';
import {
  SystemSettingsService,
  SystemSettingsResponse,
} from './system-settings.service';
import {
  UpdateSystemSettingsDto,
  updateSystemSettingsSchema,
} from './dto/update-system-settings.dto';

@Controller('system-settings')
@UseGuards(AuthGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @AllowAnonymous()
  getSettings(): Promise<SystemSettingsResponse> {
    return this.systemSettingsService.getSettings();
  }

  @Get('carousel')
  @AllowAnonymous()
  async getCarouselImages() {
    const settings = await this.systemSettingsService.getSettings();
    return settings.carouselImages;
  }

  @Post('carousel/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }),
  )
  uploadCarouselImage(
    @Session() session: UserSession,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const validatedFile = assertValidImageUpload(file);
    return this.systemSettingsService.uploadCarouselImage(
      session?.user?.id,
      session?.user?.role,
      validatedFile,
    );
  }

  @Patch()
  updateSettings(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(updateSystemSettingsSchema))
    payload: UpdateSystemSettingsDto,
  ): Promise<SystemSettingsResponse> {
    return this.systemSettingsService.updateSettings(
      session?.user?.id,
      session?.user?.role,
      payload,
    );
  }
}
