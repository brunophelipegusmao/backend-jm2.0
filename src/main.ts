import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
