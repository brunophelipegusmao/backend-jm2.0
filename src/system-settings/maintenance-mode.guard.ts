import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { systemSettingsTable } from '../drizzle/schema/systemSettings';
import { users } from '../drizzle/schema/users';

type SessionUser = { id?: string };
type AuthSession = { user?: SessionUser };
type RequestWithSession = Request & { session?: AuthSession };

const DEFAULT_ALLOWED_ROUTES = ['/checkin'];
const AUTH_BYPASS_PREFIXES = ['/api/auth', '/auth'];
const PUBLIC_SYSTEM_SETTINGS_PATHS = [
  '/system-settings',
  '/system-settings/carousel',
];

const normalizePath = (value?: string | null) => {
  const raw = (value ?? '').trim();
  if (!raw) {
    return '/';
  }
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
};

const ensureAllowedRoutes = (value: unknown) => {
  if (!Array.isArray(value)) {
    return DEFAULT_ALLOWED_ROUTES;
  }
  const routes = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizePath(entry))
    .filter((entry) => entry.length > 0);

  return routes.length > 0 ? routes : DEFAULT_ALLOWED_ROUTES;
};

const isAllowedPath = (path: string, allowedRoutes: string[]) =>
  allowedRoutes.some((route) => {
    if (route === '/') {
      return path === '/';
    }
    return path === route || path.startsWith(`${route}/`);
  });

const isPublicSystemSettingsReadPath = (path: string, method: string) =>
  method === 'GET' &&
  PUBLIC_SYSTEM_SETTINGS_PATHS.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const path = normalizePath(request.path);

    if (request.method === 'OPTIONS') {
      return true;
    }

    if (AUTH_BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    if (isPublicSystemSettingsReadPath(path, request.method)) {
      return true;
    }

    const [settings] = await this.databaseService.database
      .select({
        maintenanceMode: systemSettingsTable.maintenanceMode,
        maintenanceMessage: systemSettingsTable.maintenanceMessage,
        maintenanceAllowedRoutes: systemSettingsTable.maintenanceAllowedRoutes,
      })
      .from(systemSettingsTable)
      .limit(1);

    if (!settings?.maintenanceMode) {
      return true;
    }

    const allowedRoutes = ensureAllowedRoutes(
      settings.maintenanceAllowedRoutes,
    );
    if (isAllowedPath(path, allowedRoutes)) {
      return true;
    }

    const userId = request.session?.user?.id;
    if (userId) {
      const [user] = await this.databaseService.database
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);

      if (user?.role === 'MASTER' || user?.role === 'ADMIN') {
        return true;
      }
    }

    throw new ServiceUnavailableException({
      code: 'MAINTENANCE_MODE_ENABLED',
      message: settings.maintenanceMessage ?? 'Sistema em manutenção',
    });
  }
}
