import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../drizzle/schema/health';
import { users } from '../drizzle/schema/users';

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

    if (path?.startsWith('/api/auth') || path?.startsWith('/auth')) {
      return true;
    }

    if (
      path === '/users/me/profile' ||
      path === '/users/me/status' ||
      path === '/health/me'
    ) {
      return true;
    }

    if (path?.startsWith('/events/public') || path === '/events/calendar') {
      return true;
    }

    const session = request.session;
    const userId = session?.user?.id;
    if (!userId) {
      return true;
    }

    const [user] = await this.databaseService.database
      .select({
        cpf: users.cpf,
        name: users.name,
        phone: users.phone,
        active: users.active,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user || !user.active) {
      throw new ForbiddenException('Usuario inativo');
    }

    const missingCpf = !user?.cpf;
    const isGuest = user?.role === 'GUEST';
    const missingName =
      !isGuest &&
      (typeof user?.name !== 'string' || user.name.trim().length === 0);
    const missingPhone =
      typeof user?.phone !== 'string' || user.phone.trim().length === 0;

    const [health] = isGuest
      ? [null]
      : await this.databaseService.database
          .select({
            id: healthProfiles.id,
            heightCm: healthProfiles.heightCm,
            weightKg: healthProfiles.weightKg,
            bloodType: healthProfiles.bloodType,
            sex: healthProfiles.sex,
            birthDate: healthProfiles.birthDate,
            injuries: healthProfiles.injuries,
            takesMedication: healthProfiles.takesMedication,
            medications: healthProfiles.medications,
            exercisesRegularly: healthProfiles.exercisesRegularly,
            usesSupplementation: healthProfiles.usesSupplementation,
            supplements: healthProfiles.supplements,
          })
          .from(healthProfiles)
          .where(
            and(
              eq(healthProfiles.userId, userId),
              isNull(healthProfiles.deletedAt),
            ),
          )
          .limit(1);

    const isHealthComplete = (profile?: typeof health | null) => {
      if (!profile) {
        return false;
      }
      if (
        profile.heightCm === null ||
        profile.heightCm === undefined ||
        profile.weightKg === null ||
        profile.weightKg === undefined ||
        !profile.bloodType ||
        !profile.sex ||
        !profile.birthDate ||
        !profile.injuries ||
        typeof profile.takesMedication !== 'boolean' ||
        typeof profile.exercisesRegularly !== 'boolean' ||
        typeof profile.usesSupplementation !== 'boolean'
      ) {
        return false;
      }
      if (profile.takesMedication && !profile.medications?.trim()) {
        return false;
      }
      if (profile.usesSupplementation && !profile.supplements?.trim()) {
        return false;
      }
      return true;
    };

    const missingHealth = isGuest ? false : !isHealthComplete(health);

    if (missingCpf || missingName || missingPhone || missingHealth) {
      throw new ForbiddenException({
        message: 'Perfil incompleto',
        missing: {
          cpf: missingCpf,
          name: missingName,
          phone: missingPhone,
          health: missingHealth,
        },
      });
    }

    return true;
  }
}
