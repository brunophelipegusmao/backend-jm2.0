import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { auth } from './auth';
import { DatabaseModule } from './db/database.module';
import { ProfileCompletionGuard } from './auth/profile-completion.guard';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { CheckinModule } from './checkin/checkin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    UsersModule,
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
      disableGlobalAuthGuard: process.env.NODE_ENV !== 'production',
    }),
    HealthModule,
    CheckinModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ProfileCompletionGuard,
    },
  ],
})
export class AppModule {}
