import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../drizzle/schema/health';
import { plans } from '../drizzle/schema/plans';
import { account, users } from '../drizzle/schema/users';
import { ensureGuestPlanId, ensureMasterPlanId } from '../plans/plan.utils';
import { FREE_PLAN_SLUGS } from '../common/constants/plans';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ConvertGuestDto } from './dto/convert-guest.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

type AuditContext = {
  actorUserId: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly cloudinaryService: CloudinaryService,
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

  getMe(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }

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
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
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
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
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
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(plans, eq(users.planId, plans.id))
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

    if (payload.role === 'GUEST') {
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
    const requiresMasterPlan =
      payload.role === 'MASTER' || payload.role === 'ADMIN';

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
        and(
          eq(users.phone, completeProfileDto.phone),
          isNull(users.deletedAt),
        ),
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
