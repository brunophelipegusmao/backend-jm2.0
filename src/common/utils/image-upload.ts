import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const assertValidImageUpload = (file?: Express.Multer.File) => {
  if (!file) {
    throw new BadRequestException('Arquivo de imagem obrigatorio');
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Tipo de imagem invalido');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestException('Arquivo maior que 5MB');
  }
  if (!file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('Arquivo de imagem invalido');
  }
  return file;
};
