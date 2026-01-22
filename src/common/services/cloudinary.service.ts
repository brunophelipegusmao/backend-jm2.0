import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

const ALLOWED_FOLDERS = new Set(['events', 'avatars']);

type UploadImageOptions = {
  folder: 'events' | 'avatars';
  publicId?: string;
};

type UploadImageResult = {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
};

@Injectable()
export class CloudinaryService {
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.isConfigured = false;
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    this.isConfigured = true;
  }

  private ensureConfigured() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Cloudinary nao configurado');
    }
  }

  async uploadImage(
    input: Buffer | NodeJS.ReadableStream,
    options: UploadImageOptions,
  ): Promise<UploadImageResult> {
    this.ensureConfigured();
    if (!ALLOWED_FOLDERS.has(options.folder)) {
      throw new BadRequestException('Pasta de upload invalida');
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: 'image',
          public_id: options.publicId,
          overwrite: options.publicId ? true : undefined,
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Falha no upload'));
            return;
          }
          resolve(response);
        },
      );
      if (Buffer.isBuffer(input)) {
        stream.end(input);
      } else {
        input.on('error', reject);
        input.pipe(stream);
      }
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
    };
  }

  async deleteImage(publicId: string) {
    this.ensureConfigured();
    if (!publicId) {
      return null;
    }
    return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }
}
