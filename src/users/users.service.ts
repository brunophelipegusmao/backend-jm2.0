import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { auditLogs } from '../drizzle/schema/audit';
import { healthProfiles } from '../drizzle/schema/health';
import { plans } from '../drizzle/schema/plans';
import { account, users } from '../drizzle/schema/users';
import { ensureGuestPlanId, ensureMasterPlanId } from '../plans/plan.utils';
import { FREE_PLAN_SLUGS } from '../common/constants/plans';
import { MASTER_PLAN_ROLE_SET } from '../common/constants/roles';
import { BirthdayEventsService } from '../events/birthday-events.service';
import { CreatePlanRequestDto } from './dto/create-plan-request.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ConvertGuestDto } from './dto/convert-guest.dto';
import { ReviewPlanRequestDto } from './dto/review-plan-request.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

type AuditContext = {
  actorUserId: string;
  ip?: string;
  userAgent?: string;
};

type PlanRequestStatus = 'pending' | 'approved' | 'rejected';
type PlanRequestType = 'plan_change' | 'plan_activation';

type PlanRequestSnapshot = {
  id: string;
  type: PlanRequestType;
  status: PlanRequestStatus;
  requestedByUserId: string;
  currentPlanId: string | null;
  currentPlanSlug: string | null;
  currentPlanName: string | null;
  targetPlanId: string | null;
  targetPlanSlug: string | null;
  targetPlanName: string | null;
  notes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewReason: string | null;
};

type PlanRequestView = PlanRequestSnapshot & {
  requestedByName: string | null;
  requestedByEmail: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly birthdayEventsService: BirthdayEventsService,
  ) {}

  private buildAuditMetadata(context?: AuditContext) {
    if (!context) {
      return null;
    }
    const metadata: Record<string, string> = {};
    if (context.ip) {
      metadata.ip = context.ip;
    }
    if (context.userAgent) {
      metadata.userAgent = context.userAgent;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  private getAuditAfterValue(
    changes:
      | Record<string, { before: unknown; after: unknown }>
      | null
      | undefined,
    key: string,
  ) {
    if (!changes || typeof changes !== 'object') {
      return null;
    }
    const entry = changes[key];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return entry.after ?? null;
  }

  private normalizePlanRequestStatus(value: unknown): PlanRequestStatus | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'pending' ||
      normalized === 'approved' ||
      normalized === 'rejected'
    ) {
      return normalized;
    }
    return null;
  }

  private normalizePlanRequestType(value: unknown): PlanRequestType | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'plan_change' || normalized === 'plan_activation') {
      return normalized;
    }
    return null;
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRequiredText(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private hydratePlanRequestFromChanges(input: {
    entityId: string;
    createdAt: Date;
    changes: Record<string, { before: unknown; after: unknown }> | null;
  }): PlanRequestSnapshot | null {
    const id =
      this.normalizeRequiredText(this.getAuditAfterValue(input.changes, 'id')) ??
      input.entityId;
    const type = this.normalizePlanRequestType(
      this.getAuditAfterValue(input.changes, 'type'),
    );
    const status = this.normalizePlanRequestStatus(
      this.getAuditAfterValue(input.changes, 'status'),
    );
    const requestedByUserId = this.normalizeRequiredText(
      this.getAuditAfterValue(input.changes, 'requestedByUserId'),
    );

    if (!type || !status || !requestedByUserId) {
      return null;
    }

    const createdAt =
      this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'createdAt'),
      ) ?? input.createdAt.toISOString();

    return {
      id,
      type,
      status,
      requestedByUserId,
      currentPlanId: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'currentPlanId'),
      ),
      currentPlanSlug: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'currentPlanSlug'),
      ),
      currentPlanName: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'currentPlanName'),
      ),
      targetPlanId: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'targetPlanId'),
      ),
      targetPlanSlug: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'targetPlanSlug'),
      ),
      targetPlanName: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'targetPlanName'),
      ),
      notes: this.normalizeOptionalText(
        this.getAuditAfterValue(input.changes, 'notes'),
      ),
      createdAt,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewReason: null,
    };
  }

  private applyPlanRequestReviewFromChanges(
    request: PlanRequestSnapshot,
    review: {
      actorUserId: string | null;
      createdAt: Date;
      changes: Record<string, { before: unknown; after: unknown }> | null;
    },
  ) {
    const reviewedStatus = this.normalizePlanRequestStatus(
      this.getAuditAfterValue(review.changes, 'status'),
    );
    if (!reviewedStatus) {
      return request;
    }

    const reviewedAt =
      this.normalizeOptionalText(
        this.getAuditAfterValue(review.changes, 'reviewedAt'),
      ) ?? review.createdAt.toISOString();
    const reviewedByUserId =
      this.normalizeOptionalText(
        this.getAuditAfterValue(review.changes, 'reviewedByUserId'),
      ) ?? review.actorUserId;
    const reviewReason = this.normalizeOptionalText(
      this.getAuditAfterValue(review.changes, 'reviewReason'),
    );

    return {
      ...request,
      status: reviewedStatus,
      reviewedAt,
      reviewedByUserId,
      reviewReason,
    };
  }

  private async getPlanRequestSnapshotById(
    requestId: string,
  ): Promise<PlanRequestSnapshot | null> {
    const [creationLog] = await this.databaseService.database
      .select({
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        changes: auditLogs.changes,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'plan_requests'),
          eq(auditLogs.entityId, requestId),
          inArray(auditLogs.action, [
            'plan_change_requested',
            'plan_activation_requested',
          ]),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (!creationLog) {
      return null;
    }

    const hydrated = this.hydratePlanRequestFromChanges(creationLog);
    if (!hydrated) {
      return null;
    }

    const [latestReview] = await this.databaseService.database
      .select({
        actorUserId: auditLogs.actorUserId,
        createdAt: auditLogs.createdAt,
        changes: auditLogs.changes,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'plan_requests'),
          eq(auditLogs.entityId, requestId),
          eq(auditLogs.action, 'plan_request_reviewed'),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (!latestReview) {
      return hydrated;
    }

    return this.applyPlanRequestReviewFromChanges(hydrated, latestReview);
  }

  async getMe(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    await this.birthdayEventsService.syncForUser(session.user.id);

    return this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        planName: plans.name,
        planSlug: plans.slug,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  getByIdForAdmin(userId: string) {
    return this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        birthDate: healthProfiles.birthDate,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(
        healthProfiles,
        and(
          eq(healthProfiles.userId, users.id),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  listForAdmin() {
    return this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        planName: plans.name,
        planSlug: plans.slug,
        birthDate: healthProfiles.birthDate,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
      .leftJoin(
        healthProfiles,
        and(
          eq(healthProfiles.userId, users.id),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .where(isNull(users.deletedAt))
      .orderBy(asc(users.name), asc(users.email));
  }

  async getProfileStatus(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [user] = await this.databaseService.database
      .select({
        cpf: users.cpf,
        name: users.name,
        phone: users.phone,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    const [passwordAccount] = await this.databaseService.database
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, 'credential'),
          isNotNull(account.password),
        ),
      )
      .limit(1);

    const [health] = await this.databaseService.database
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

    const nameFilled =
      typeof user?.name === 'string' && user.name.trim().length > 0;
    const phoneFilled =
      typeof user?.phone === 'string' && user.phone.trim().length > 0;
    const isGuest = user?.role === 'GUEST';
    const cpfFilled = !!user?.cpf && phoneFilled && (isGuest || nameFilled);

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

    return {
      cpfFilled,
      nameFilled,
      phoneFilled,
      healthFilled: isGuest ? true : isHealthComplete(health),
      hasPassword: !!passwordAccount,
    };
  }

  async updateMe(session: { user?: { id?: string } }, payload: UpdateMeDto) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [current] = await this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    const normalizedEmail =
      payload.email !== undefined ? payload.email.toLowerCase() : undefined;
    const normalizedPhone =
      payload.phone !== undefined ? payload.phone.trim() : undefined;

    if (normalizedEmail) {
      const [existingEmail] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
        .limit(1);

      if (existingEmail && existingEmail.id !== userId) {
        throw new BadRequestException('Email ja cadastrado');
      }
    }

    if (normalizedPhone) {
      const [existingPhone] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, normalizedPhone), isNull(users.deletedAt)))
        .limit(1);

      if (existingPhone && existingPhone.id !== userId) {
        throw new BadRequestException('Telefone ja cadastrado');
      }
    }

    const updateData: Partial<typeof users.$inferInsert> = {};
    if (normalizedEmail !== undefined) {
      updateData.email = normalizedEmail;
    }
    if (payload.name !== undefined) {
      updateData.name = payload.name;
    }
    if (normalizedPhone !== undefined) {
      updateData.phone = normalizedPhone;
    }
    if (payload.address !== undefined) {
      updateData.address = payload.address || null;
    }
    if (payload.image !== undefined) {
      updateData.image = payload.image || null;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getMe(session);
    }

    const [updated] = await this.databaseService.database
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    await this.auditService.log({
      actorUserId: userId,
      targetUserId: userId,
      entity: 'users',
      entityId: userId,
      action: 'self_updated',
      before: current,
      after: updated ?? current,
      metadata: null,
    });

    return this.getMe(session);
  }

  async createPlanRequest(
    session: { user?: { id?: string } },
    payload: CreatePlanRequestDto,
  ) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [currentUser] = await this.databaseService.database
      .select({
        id: users.id,
        active: users.active,
        planId: users.planId,
        currentPlanSlug: plans.slug,
        currentPlanName: plans.name,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!currentUser || !currentUser.active) {
      throw new BadRequestException('Usuario nao encontrado ou inativo');
    }

    let targetPlanId = payload.targetPlanId ?? currentUser.planId;
    let targetPlanSlug = currentUser.currentPlanSlug ?? null;
    let targetPlanName = currentUser.currentPlanName ?? null;

    if (payload.targetPlanId) {
      const [targetPlan] = await this.databaseService.database
        .select({
          id: plans.id,
          slug: plans.slug,
          name: plans.name,
          active: plans.active,
        })
        .from(plans)
        .where(and(eq(plans.id, payload.targetPlanId), isNull(plans.deletedAt)))
        .limit(1);

      if (!targetPlan || !targetPlan.active) {
        throw new BadRequestException('Plano nao encontrado');
      }

      targetPlanId = targetPlan.id;
      targetPlanSlug = targetPlan.slug;
      targetPlanName = targetPlan.name;
    }

    if (payload.type === 'plan_change' && targetPlanId === currentUser.planId) {
      throw new BadRequestException('Selecione um plano diferente do atual');
    }

    if (!targetPlanSlug || FREE_PLAN_SLUGS.has(targetPlanSlug)) {
      throw new BadRequestException('Selecione um plano diferente do free');
    }

    const requestId = randomUUID();
    const createdAt = new Date();
    const result = {
      id: requestId,
      type: payload.type,
      status: 'pending' as const,
      requestedByUserId: userId,
      currentPlanId: currentUser.planId,
      currentPlanSlug: currentUser.currentPlanSlug,
      currentPlanName: currentUser.currentPlanName,
      targetPlanId,
      targetPlanSlug,
      targetPlanName,
      notes: payload.notes?.trim() || null,
      createdAt: createdAt.toISOString(),
    };

    await this.auditService.log({
      actorUserId: userId,
      targetUserId: userId,
      entity: 'plan_requests',
      entityId: requestId,
      action:
        payload.type === 'plan_change'
          ? 'plan_change_requested'
          : 'plan_activation_requested',
      before: null,
      after: result,
      metadata: { status: 'pending' },
    });

    return result;
  }

  async listPlanRequestsForAdmin(options?: {
    status?: 'all' | PlanRequestStatus;
  }): Promise<PlanRequestView[]> {
    const creationLogs = await this.databaseService.database
      .select({
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        changes: auditLogs.changes,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'plan_requests'),
          inArray(auditLogs.action, [
            'plan_change_requested',
            'plan_activation_requested',
          ]),
        ),
      )
      .orderBy(desc(auditLogs.createdAt));

    const reviews = await this.databaseService.database
      .select({
        entityId: auditLogs.entityId,
        actorUserId: auditLogs.actorUserId,
        createdAt: auditLogs.createdAt,
        changes: auditLogs.changes,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entity, 'plan_requests'),
          eq(auditLogs.action, 'plan_request_reviewed'),
        ),
      )
      .orderBy(desc(auditLogs.createdAt));

    const requestsById = new Map<string, PlanRequestSnapshot>();
    for (const log of creationLogs) {
      const request = this.hydratePlanRequestFromChanges(log);
      if (!request) {
        continue;
      }
      if (!requestsById.has(request.id)) {
        requestsById.set(request.id, request);
      }
    }

    for (const review of reviews) {
      const current = requestsById.get(review.entityId);
      if (!current) {
        continue;
      }
      requestsById.set(
        review.entityId,
        this.applyPlanRequestReviewFromChanges(current, review),
      );
    }

    const requests = Array.from(requestsById.values());
    if (requests.length === 0) {
      return [];
    }

    const requestedByIds = new Set<string>();
    const reviewedByIds = new Set<string>();
    for (const request of requests) {
      requestedByIds.add(request.requestedByUserId);
      if (request.reviewedByUserId) {
        reviewedByIds.add(request.reviewedByUserId);
      }
    }

    const uniqueUserIds = Array.from(new Set([...requestedByIds, ...reviewedByIds]));
    const usersRows =
      uniqueUserIds.length === 0
        ? []
        : await this.databaseService.database
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(and(inArray(users.id, uniqueUserIds), isNull(users.deletedAt)));

    const usersById = new Map(usersRows.map((row) => [row.id, row]));

    const filteredStatus = options?.status && options.status !== 'all' ? options.status : null;

    return requests
      .filter((request) => !filteredStatus || request.status === filteredStatus)
      .sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return right - left;
      })
      .map((request) => {
        const requestedBy = usersById.get(request.requestedByUserId);
        const reviewedBy = request.reviewedByUserId
          ? usersById.get(request.reviewedByUserId)
          : null;

        return {
          ...request,
          requestedByName: requestedBy?.name ?? null,
          requestedByEmail: requestedBy?.email ?? null,
          reviewedByName: reviewedBy?.name ?? null,
          reviewedByEmail: reviewedBy?.email ?? null,
        };
      });
  }

  async reviewPlanRequestByAdmin(
    requestId: string,
    payload: ReviewPlanRequestDto,
    reviewerUserId: string,
  ) {
    const request = await this.getPlanRequestSnapshotById(requestId);
    if (!request) {
      throw new BadRequestException('Solicitacao nao encontrada');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Solicitacao ja foi analisada');
    }

    const [requestedUser] = await this.databaseService.database
      .select({
        id: users.id,
      })
      .from(users)
      .where(and(eq(users.id, request.requestedByUserId), isNull(users.deletedAt)))
      .limit(1);

    if (!requestedUser) {
      throw new BadRequestException('Usuario solicitante nao encontrado');
    }

    const reviewReason = payload.reason?.trim() || null;

    if (payload.status === 'approved') {
      if (request.type === 'plan_change') {
        if (!request.targetPlanId) {
          throw new BadRequestException('Plano de destino nao informado');
        }

        const [targetPlan] = await this.databaseService.database
          .select({
            id: plans.id,
            slug: plans.slug,
            active: plans.active,
          })
          .from(plans)
          .where(and(eq(plans.id, request.targetPlanId), isNull(plans.deletedAt)))
          .limit(1);

        if (!targetPlan || !targetPlan.active) {
          throw new BadRequestException('Plano de destino nao encontrado');
        }
        if (!targetPlan.slug || FREE_PLAN_SLUGS.has(targetPlan.slug)) {
          throw new BadRequestException('Plano de destino invalido');
        }

        await this.databaseService.database
          .update(users)
          .set({
            planId: targetPlan.id,
            updatedAt: new Date(),
          })
          .where(
            and(eq(users.id, request.requestedByUserId), isNull(users.deletedAt)),
          );
      } else {
        const updateData: Partial<typeof users.$inferInsert> = {
          active: true,
          updatedAt: new Date(),
        };

        if (request.targetPlanId) {
          const [activationPlan] = await this.databaseService.database
            .select({
              id: plans.id,
              slug: plans.slug,
              active: plans.active,
            })
            .from(plans)
            .where(and(eq(plans.id, request.targetPlanId), isNull(plans.deletedAt)))
            .limit(1);

          if (!activationPlan || !activationPlan.active) {
            throw new BadRequestException('Plano de ativacao nao encontrado');
          }
          if (!activationPlan.slug || FREE_PLAN_SLUGS.has(activationPlan.slug)) {
            throw new BadRequestException('Plano de ativacao invalido');
          }

          updateData.planId = activationPlan.id;
        }

        await this.databaseService.database
          .update(users)
          .set(updateData)
          .where(
            and(eq(users.id, request.requestedByUserId), isNull(users.deletedAt)),
          );
      }
    }

    const reviewedAt = new Date().toISOString();
    await this.auditService.log({
      actorUserId: reviewerUserId,
      targetUserId: request.requestedByUserId,
      entity: 'plan_requests',
      entityId: request.id,
      action: 'plan_request_reviewed',
      before: {
        status: request.status,
        reviewedAt: request.reviewedAt,
        reviewedByUserId: request.reviewedByUserId,
        reviewReason: request.reviewReason,
      },
      after: {
        status: payload.status,
        reviewedAt,
        reviewedByUserId: reviewerUserId,
        reviewReason,
      },
      metadata: {
        type: request.type,
        targetPlanId: request.targetPlanId,
      },
    });

    return this.getPlanRequestSnapshotById(request.id);
  }

  async updateByIdForAdmin(
    userId: string,
    payload: UpdateUserAdminDto,
    actor: { actorUserId: string; ip?: string; userAgent?: string },
  ) {
    const [current] = await this.databaseService.database
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    if (payload.email) {
      const [existingEmail] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, payload.email), isNull(users.deletedAt)))
        .limit(1);

      if (existingEmail && existingEmail.id !== userId) {
        throw new BadRequestException('Email ja cadastrado');
      }
    }

    if (payload.cpf) {
      const [existingCpf] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.cpf, payload.cpf), isNull(users.deletedAt)))
        .limit(1);

      if (existingCpf && existingCpf.id !== userId) {
        throw new BadRequestException('CPF ja cadastrado');
      }
    }

    if (payload.phone) {
      const [existingPhone] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, payload.phone), isNull(users.deletedAt)))
        .limit(1);

      if (existingPhone && existingPhone.id !== userId) {
        throw new BadRequestException('Telefone ja cadastrado');
      }
    }

    if (payload.role === 'MASTER' && current.role !== 'MASTER') {
      const [existingMaster] = await this.databaseService.database
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'MASTER'), isNull(users.deletedAt)))
        .limit(1);

      if (existingMaster) {
        throw new BadRequestException('Ja existe um master cadastrado');
      }
    }

    if (payload.role === 'GUEST' && current.role !== 'GUEST') {
      const phoneNumber = payload.phone ?? current.phone;
      if (!phoneNumber) {
        throw new BadRequestException('Telefone obrigatorio para convidados');
      }
      const cpfNumber = payload.cpf ?? current.cpf;
      if (!cpfNumber) {
        throw new BadRequestException('CPF obrigatorio para convidados');
      }
    }

    let planIdToApply: string | undefined;
    const nextRole = payload.role ?? current.role;
    const requiresMasterPlan = MASTER_PLAN_ROLE_SET.has(nextRole);

    if (requiresMasterPlan) {
      planIdToApply = await ensureMasterPlanId(this.databaseService.database);
    } else if (payload.role === 'GUEST') {
      planIdToApply = await ensureGuestPlanId(this.databaseService.database);
    } else if (payload.planId !== undefined) {
      const [plan] = await this.databaseService.database
        .select({ id: plans.id })
        .from(plans)
        .where(and(eq(plans.id, payload.planId), isNull(plans.deletedAt)))
        .limit(1);

      if (!plan) {
        throw new BadRequestException('Plano nao encontrado');
      }

      planIdToApply = payload.planId;
    }

    const updateData: Partial<typeof users.$inferInsert> = {};
    if (payload.email !== undefined) {
      updateData.email = payload.email.toLowerCase();
    }
    if (payload.cpf !== undefined) {
      updateData.cpf = payload.cpf;
    }
    if (payload.name !== undefined) {
      updateData.name = payload.name;
    }
    if (payload.phone !== undefined) {
      updateData.phone = payload.phone;
    }
    if (payload.address !== undefined) {
      updateData.address = payload.address;
    }
    if (payload.image !== undefined) {
      updateData.image = payload.image;
    }
    if (payload.active !== undefined) {
      updateData.active = payload.active;
    }
    if (payload.role !== undefined) {
      updateData.role = payload.role;
    }
    if (planIdToApply !== undefined) {
      updateData.planId = planIdToApply;
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const [updated] = await this.databaseService.database
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    const result = updated ?? null;

    await this.auditService.log({
      actorUserId: actor.actorUserId,
      targetUserId: userId,
      entity: 'user',
      entityId: userId,
      action: 'USER_UPDATE',
      before: current,
      after: result ?? current,
      metadata: {
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });

    await this.birthdayEventsService.syncForUser(userId);

    return result;
  }

  async completeProfile(
    session: { user?: { id?: string } },
    completeProfileDto: CompleteProfileDto,
  ) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }

    if (!completeProfileDto.cpf) {
      throw new BadRequestException('CPF é obrigatório');
    }
    if (!completeProfileDto.phone?.trim()) {
      throw new BadRequestException('Telefone é obrigatório');
    }

    const [current] = await this.databaseService.database
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    if (current.role !== 'GUEST' && !completeProfileDto.name?.trim()) {
      throw new BadRequestException('Nome é obrigatório');
    }

    const [existingCpf] = await this.databaseService.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.cpf, completeProfileDto.cpf), isNull(users.deletedAt)),
      )
      .limit(1);

    if (existingCpf && existingCpf.id !== session.user.id) {
      throw new BadRequestException('CPF já cadastrado');
    }

    const [existingPhone] = await this.databaseService.database
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.phone, completeProfileDto.phone), isNull(users.deletedAt)),
      )
      .limit(1);

    if (existingPhone && existingPhone.id !== session.user.id) {
      throw new BadRequestException('Telefone já cadastrado');
    }

    const payload: {
      cpf: string;
      name?: string | null;
      phone?: string | null;
      address?: string | null;
      image?: string | null;
    } = {
      cpf: completeProfileDto.cpf,
    };

    payload.name = completeProfileDto.name ?? null;
    payload.phone = completeProfileDto.phone;
    if (completeProfileDto.address !== undefined) {
      payload.address = completeProfileDto.address;
    }
    if (completeProfileDto.image !== undefined) {
      payload.image = completeProfileDto.image;
    }

    const [user] = await this.databaseService.database
      .update(users)
      .set(payload)
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
      .returning();

    await this.birthdayEventsService.syncForUser(session.user.id);
    return user ?? null;
  }

  async convertGuestToStudent(
    session: { user?: { id?: string } },
    convertGuestDto: ConvertGuestDto,
    audit?: AuditContext,
  ) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [current] = await this.databaseService.database
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        active: users.active,
        planId: users.planId,
      })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.role, 'GUEST'),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (!current || !current.active) {
      throw new BadRequestException('Usuario nao encontrado ou inativo');
    }

    const [plan] = await this.databaseService.database
      .select({ id: plans.id, slug: plans.slug })
      .from(plans)
      .where(and(eq(plans.id, convertGuestDto.planId), isNull(plans.deletedAt)))
      .limit(1);

    if (!plan) {
      throw new BadRequestException('Plano nao encontrado');
    }

    if (FREE_PLAN_SLUGS.has(plan.slug)) {
      throw new BadRequestException('Selecione um plano valido');
    }

    const updateData: Partial<typeof users.$inferInsert> = {
      cpf: convertGuestDto.cpf,
      phone: convertGuestDto.phone,
      role: 'STUDENT',
      planId: plan.id,
      updatedAt: new Date(),
    };

    if (convertGuestDto.name !== undefined) {
      updateData.name = convertGuestDto.name;
    }

    const [updated] = await this.databaseService.database
      .update(users)
      .set(updateData)
      .where(
        and(
          eq(users.id, userId),
          eq(users.role, 'GUEST'),
          isNull(users.deletedAt),
        ),
      )
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        cpf: users.cpf,
        name: users.name,
        image: users.image,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        address: users.address,
        phone: users.phone,
        active: users.active,
        role: users.role,
        planId: users.planId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    const result = updated ?? null;

    await this.auditService.log({
      actorUserId: audit?.actorUserId ?? userId,
      targetUserId: userId,
      entity: 'user',
      entityId: userId,
      action: 'guest_to_student',
      before: current,
      after: result ?? current,
      metadata: this.buildAuditMetadata(audit),
    });

    await this.birthdayEventsService.syncForUser(userId);

    return result;
  }

  async updateAvatar(
    userId: string,
    file: { buffer: Buffer },
    audit?: AuditContext,
  ) {
    const [current] = await this.databaseService.database
      .select({
        id: users.id,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        image: users.image,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Usuario nao encontrado');
    }

    const uploaded = await this.cloudinaryService.uploadImage(file.buffer, {
      folder: 'avatars',
    });

    const [updated] = await this.databaseService.database
      .update(users)
      .set({
        avatarPublicId: uploaded.publicId,
        avatarUrl: uploaded.secureUrl,
        image: uploaded.secureUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({
        id: users.id,
        avatarPublicId: users.avatarPublicId,
        avatarUrl: users.avatarUrl,
        image: users.image,
      });

    const result = updated ?? null;

    await this.auditService.log({
      actorUserId: audit?.actorUserId,
      targetUserId: userId,
      entity: 'users',
      entityId: userId,
      action: 'avatar_updated',
      before: current,
      after: result ?? current,
      metadata: this.buildAuditMetadata(audit),
    });

    if (current.avatarPublicId) {
      try {
        await this.cloudinaryService.deleteImage(current.avatarPublicId);
      } catch {
        // Ignore cleanup failures to avoid breaking avatar update.
      }
    }

    return result;
  }
}
