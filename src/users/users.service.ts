import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../drizzle/schema/health';
import { plans } from '../drizzle/schema/plans';
import { account, users } from '../drizzle/schema/users';
import { ensureMasterPlanId } from '../plans/plan.utils';
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

  async getProfileStatus(session: { user?: { id?: string } }) {
    if (!session?.user?.id) {
      throw new BadRequestException('Sessão inválida');
    }
    const userId = session.user.id;

    const [user] = await this.databaseService.database
      .select({ cpf: users.cpf })
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
      .select({ id: healthProfiles.id })
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);

    return {
      cpfFilled: !!user?.cpf,
      healthFilled: !!health,
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
    }

    let planIdToApply: string | undefined;
    const requiresMasterPlan =
      payload.role === 'MASTER' || payload.role === 'ADMIN';

    if (requiresMasterPlan) {
      planIdToApply = await ensureMasterPlanId(this.databaseService.database);
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

    const payload: {
      cpf: string;
      name?: string | null;
      phone?: string | null;
      address?: string | null;
      image?: string | null;
    } = {
      cpf: completeProfileDto.cpf,
    };

    if (completeProfileDto.name !== undefined) {
      payload.name = completeProfileDto.name;
    }
    if (completeProfileDto.phone !== undefined) {
      payload.phone = completeProfileDto.phone;
    }
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
