import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { users } from '../../drizzle/schema/users';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UserRole } from '../constants/roles';

type SessionUser = { id?: string };
type AuthSession = { user?: SessionUser };
type RequestWithSession = Request & { session?: AuthSession };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const userId = request.session?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Sessao invalida');
    }

    const [user] = await this.databaseService.database
      .select({ role: users.role, active: users.active })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user || !user.active) {
      throw new ForbiddenException('Usuario inativo');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Acesso negado');
    }

    return true;
  }
}
