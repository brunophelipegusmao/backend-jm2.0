import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  AllowAnonymous,
  AuthGuard,
} from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { auth } from '../auth';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SetPasswordDto, setPasswordSchema } from './dto/set-password.dto';

const applyAuthHeaders = (res: Response, headers?: Headers | null) => {
  if (!headers) {
    return;
  }
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      res.append(key, value);
      return;
    }
    res.setHeader(key, value);
  });
};

@Controller('auth')
export class AuthController {
  @Post('logout')
  @AllowAnonymous()
  async logout(@Req() request: Request, @Res({ passthrough: true }) res: Response) {
    const result = await auth.api.signOut({
      headers: request.headers as Record<string, string>,
      returnHeaders: true,
      returnStatus: true,
    });

    applyAuthHeaders(res, result.headers);
    return result.response ?? { status: true };
  }

  @Post('password')
  @UseGuards(AuthGuard)
  async setPassword(
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(setPasswordSchema))
    payload: SetPasswordDto,
  ) {
    const result = await auth.api.setPassword({
      headers: request.headers as Record<string, string>,
      body: payload,
      returnHeaders: true,
      returnStatus: true,
    });

    applyAuthHeaders(res, result.headers);
    return result.response ?? { status: true };
  }
}
