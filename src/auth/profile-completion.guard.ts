import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../../drizzle/schema/health';
import { users } from '../../drizzle/schema/users';

type SessionUser = { id?: string };
type AuthSession = { user?: SessionUser };

type RequestWithSession = Request & {
  session?: AuthSession;
};

@Injectable()
export class ProfileCompletionGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const path = request.path;

    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    if (path?.startsWith('/api/auth')) {
      return true;
    }

    if (
      path === '/users/me/profile' ||
      path === '/users/me/status' ||
      path === '/health/me'
    ) {
      return true;
    }

    const session = request.session;
    const userId = session?.user?.id;
    if (!userId) {
      return true;
    }

    const [user] = await this.databaseService.database
      .select({ cpf: users.cpf })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [health] = await this.databaseService.database
      .select({ id: healthProfiles.id })
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1);

    const missingCpf = !user?.cpf;
    const missingHealth = !health;

    if (missingCpf || missingHealth) {
      throw new ForbiddenException({
        message: 'Perfil incompleto',
        missing: {
          cpf: missingCpf,
          health: missingHealth,
        },
      });
    }

    return true;
  }
}
