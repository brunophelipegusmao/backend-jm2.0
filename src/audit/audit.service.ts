import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { auditLogs } from '../drizzle/schema/audit';

type AuditChange = { before: unknown; after: unknown };

type AuditLogInput = {
  actorUserId?: string | null;
  targetUserId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ignoredFields?: string[];
};

const DEFAULT_IGNORED_FIELDS = new Set(['createdAt', 'updatedAt', 'deletedAt']);

const normalizeValue = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
};

const valuesMatch = (before: unknown, after: unknown) => {
  const left = normalizeValue(before);
  const right = normalizeValue(after);
  if (left === right) {
    return true;
  }
  return JSON.stringify(left) === JSON.stringify(right);
};

const buildChanges = (
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  ignoredFields: Set<string> = DEFAULT_IGNORED_FIELDS,
) => {
  const changes: Record<string, AuditChange> = {};
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  keys.forEach((key) => {
    if (ignoredFields.has(key)) {
      return;
    }
    const beforeValue = before ? before[key] : null;
    const afterValue = after ? after[key] : null;
    if (valuesMatch(beforeValue, afterValue)) {
      return;
    }
    changes[key] = {
      before: normalizeValue(beforeValue),
      after: normalizeValue(afterValue),
    };
  });

  return changes;
};

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  async log({
    actorUserId,
    targetUserId,
    entity,
    entityId,
    action,
    before,
    after,
    metadata,
    ignoredFields,
  }: AuditLogInput) {
    const changes = buildChanges(
      before,
      after,
      ignoredFields ? new Set(ignoredFields) : DEFAULT_IGNORED_FIELDS,
    );

    if (Object.keys(changes).length === 0) {
      return null;
    }

    const [entry] = await this.databaseService.database
      .insert(auditLogs)
      .values({
        actorUserId: actorUserId ?? null,
        targetUserId: targetUserId ?? null,
        entity,
        entityId,
        action,
        changes,
        metadata: metadata ?? null,
      })
      .returning();

    return entry ?? null;
  }
}
