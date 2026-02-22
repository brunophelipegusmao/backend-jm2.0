import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../db/database.service';
import { healthMeasurements, healthProfiles } from '../drizzle/schema/health';
import { BirthdayEventsService } from '../events/birthday-events.service';
import { CreateHealthDto } from './dto/create-health.dto';
import { ComputeBodyCompositionDto } from './dto/compute-body-composition.dto';
import { UpdateHealthDto } from './dto/update-health.dto';
import {
  computeBodyComposition,
  type BodyCompositionResult,
  type FemaleSkinfolds,
  type MaleSkinfolds,
  type Sex,
  bmiCategoryFromAdult,
} from './body-composition';

type HealthInput = {
  sex?: Sex | null;
  birthDate?: string | Date | null;
  weightKg?: number | string | null;
  heightCm?: number | string | null;
  skinfoldChest?: number | string | null;
  skinfoldAbdomen?: number | string | null;
  skinfoldThigh?: number | string | null;
  skinfoldTriceps?: number | string | null;
  skinfoldSuprailiac?: number | string | null;
  targetBodyFatPercent?: number | string | null;
};

type HealthMeasurementInput = HealthInput & {
  bloodType?: string | null;
  skinfoldSubscapular?: number | string | null;
  skinfoldMidaxillary?: number | string | null;
};

type AuditActor = {
  actorUserId: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly birthdayEventsService: BirthdayEventsService,
  ) {}

  private toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric =
      typeof value === 'number'
        ? value
        : Number(String(value).trim().replace(',', '.'));
    return Number.isNaN(numeric) ? null : numeric;
  }

  private toNumericString(value: number | string | null | undefined) {
    const numeric = this.toNumber(value);
    return numeric === null ? undefined : numeric.toString();
  }

  private normalizeHeightCm(value: number | string | null | undefined) {
    const numeric = this.toNumber(value);
    if (numeric === null) {
      return null;
    }
    if (numeric > 0 && numeric < 3.5) {
      return numeric * 100;
    }
    return numeric;
  }

  private normalizeBloodType(value: string | null | undefined) {
    const allowed = [
      'A_POSITIVE',
      'A_NEGATIVE',
      'B_POSITIVE',
      'B_NEGATIVE',
      'AB_POSITIVE',
      'AB_NEGATIVE',
      'O_NEGATIVE',
      'O_POSITIVE',
    ] as const;
    if (!value) {
      return null;
    }
    return allowed.includes(value as (typeof allowed)[number])
      ? (value as (typeof allowed)[number])
      : null;
  }

  private computeAge(birthDate: string | Date) {
    const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (Number.isNaN(birth.getTime())) {
      return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() >= birth.getDate());
    if (!hasHadBirthday) {
      age -= 1;
    }
    return age;
  }

  private bmiCategoryForProfile(
    birthDate?: string | Date | null,
    bmi?: string | null,
  ) {
    if (!birthDate || !bmi) {
      return undefined;
    }
    const age = this.computeAge(birthDate);
    if (age === null || age < 20) {
      return undefined;
    }
    const numeric = Number(bmi);
    if (Number.isNaN(numeric)) {
      return undefined;
    }
    return bmiCategoryFromAdult(numeric);
  }

  private attachBmiCategory<T extends { birthDate?: any; bmi?: any }>(
    profile: T | null,
  ) {
    if (!profile) {
      return profile;
    }
    const bmiCategory = this.bmiCategoryForProfile(
      profile.birthDate,
      profile.bmi,
    );
    return { ...profile, bmiCategory };
  }

  private stripBmiCategory<T extends Record<string, any>>(profile: T | null) {
    if (!profile) {
      return profile;
    }
    const { bmiCategory, ...rest } = profile;
    return rest;
  }

  private computeDerivedFields(input: HealthInput) {
    const derived: Record<string, string> = {};
    const weight = this.toNumber(input.weightKg);
    const height = this.normalizeHeightCm(input.heightCm);

    if (weight !== null && height !== null && height > 0) {
      const heightM = height / 100;
      derived.bmi = (weight / (heightM * heightM)).toString();
    }

    if (!input.sex || !input.birthDate || weight === null) {
      return derived;
    }

    const age = this.computeAge(input.birthDate);
    if (age === null) {
      return derived;
    }

    const sex = input.sex;
    const thigh = this.toNumber(input.skinfoldThigh);
    if (thigh === null) {
      return derived;
    }

    let skinfolds: FemaleSkinfolds | MaleSkinfolds | null = null;
    if (sex === 'MALE') {
      const chest = this.toNumber(input.skinfoldChest);
      const abdomen = this.toNumber(input.skinfoldAbdomen);
      if (chest !== null && abdomen !== null) {
        skinfolds = { chestMm: chest, abdominalMm: abdomen, thighMm: thigh };
      }
    } else {
      const triceps = this.toNumber(input.skinfoldTriceps);
      const supra = this.toNumber(input.skinfoldSuprailiac);
      if (triceps !== null && supra !== null) {
        skinfolds = { tricepsMm: triceps, suprailiacMm: supra, thighMm: thigh };
      }
    }

    if (!skinfolds) {
      return derived;
    }

    const goal = this.toNumber(input.targetBodyFatPercent) ?? undefined;
    const composition = computeBodyComposition({
      sex,
      age,
      weightKg: weight,
      skinfolds,
      goalBodyFatPct: goal,
    });

    derived.pollockSum = composition.sumSkinfoldsMm.toString();
    derived.bodyDensity = composition.bodyDensity.toString();
    derived.bodyFatPercent = composition.bodyFatPct.toString();
    derived.fatMassKg = composition.fatMassKg.toString();
    derived.leanMassKg = composition.leanMassKg.toString();

    if (composition.goal) {
      derived.targetBodyFatPercent = composition.goal.goalBodyFatPct.toString();
      derived.idealBodyMassKg = composition.goal.targetBodyWeightKg.toString();
      derived.excessMassKg = composition.goal.excessWeightKg.toString();
      derived.kcalDeficit = composition.goal.kcalToGoal.toString();
    }

    return derived;
  }

  private buildHealthValues(payload: CreateHealthDto | UpdateHealthDto) {
    const normalizedHeight = this.normalizeHeightCm(payload.heightCm);
    return {
      ...payload,
      heightCm:
        normalizedHeight === null ? undefined : normalizedHeight.toString(),
      weightKg: this.toNumericString(payload.weightKg),
      skinfoldChest: this.toNumericString(payload.skinfoldChest),
      skinfoldAbdomen: this.toNumericString(payload.skinfoldAbdomen),
      skinfoldThigh: this.toNumericString(payload.skinfoldThigh),
      skinfoldTriceps: this.toNumericString(payload.skinfoldTriceps),
      skinfoldSuprailiac: this.toNumericString(payload.skinfoldSuprailiac),
      skinfoldSubscapular: this.toNumericString(payload.skinfoldSubscapular),
      skinfoldMidaxillary: this.toNumericString(payload.skinfoldMidaxillary),
      targetBodyFatPercent: this.toNumericString(payload.targetBodyFatPercent),
    };
  }

  private buildComposition(
    payload: ComputeBodyCompositionDto,
  ): BodyCompositionResult {
    const age =
      payload.age ??
      (payload.birthDate ? this.computeAge(payload.birthDate) : null);
    if (!age) {
      throw new BadRequestException('age inválida');
    }

    const sex = payload.sex as Sex;
    const skinfolds: FemaleSkinfolds | MaleSkinfolds =
      sex === 'MALE'
        ? {
            chestMm: payload.chestMm!,
            abdominalMm: payload.abdominalMm!,
            thighMm: payload.thighMm,
          }
        : {
            tricepsMm: payload.tricepsMm!,
            suprailiacMm: payload.suprailiacMm!,
            thighMm: payload.thighMm,
          };

    const heightCm = this.normalizeHeightCm(payload.heightCm);
    return computeBodyComposition({
      sex,
      age,
      weightKg: payload.weightKg,
      heightCm: heightCm === null ? undefined : heightCm,
      skinfolds,
      goalBodyFatPct: payload.goalBodyFatPct,
    });
  }

  private hasMeasurementData(input: HealthMeasurementInput) {
    const fields = [
      input.heightCm,
      input.weightKg,
      input.skinfoldChest,
      input.skinfoldAbdomen,
      input.skinfoldThigh,
      input.skinfoldTriceps,
      input.skinfoldSubscapular,
      input.skinfoldSuprailiac,
      input.skinfoldMidaxillary,
    ];
    return fields.some((value) => this.toNumber(value) !== null);
  }

  private async recordMeasurement(
    userId: string,
    input: HealthMeasurementInput,
  ) {
    if (!this.hasMeasurementData(input)) {
      return;
    }

    const heightCm = this.normalizeHeightCm(input.heightCm);
    const weightKg = this.toNumber(input.weightKg);
    const derived = this.computeDerivedFields({
      ...input,
      heightCm: heightCm ?? undefined,
      weightKg: weightKg ?? undefined,
    });
    const bmiCategory = this.bmiCategoryForProfile(
      input.birthDate ?? null,
      derived.bmi ?? null,
    );
    const birthDate =
      input.birthDate instanceof Date
        ? input.birthDate.toISOString().slice(0, 10)
        : (input.birthDate ?? null);

    await this.databaseService.database.insert(healthMeasurements).values({
      userId,
      recordedAt: new Date(),
      sex: input.sex ?? null,
      birthDate,
      heightCm: heightCm === null ? undefined : heightCm.toString(),
      weightKg: weightKg === null ? undefined : weightKg.toString(),
      bloodType: this.normalizeBloodType(input.bloodType),
      skinfoldChest: this.toNumericString(input.skinfoldChest),
      skinfoldAbdomen: this.toNumericString(input.skinfoldAbdomen),
      skinfoldThigh: this.toNumericString(input.skinfoldThigh),
      skinfoldTriceps: this.toNumericString(input.skinfoldTriceps),
      skinfoldSubscapular: this.toNumericString(input.skinfoldSubscapular),
      skinfoldSuprailiac: this.toNumericString(input.skinfoldSuprailiac),
      skinfoldMidaxillary: this.toNumericString(input.skinfoldMidaxillary),
      targetBodyFatPercent: this.toNumericString(input.targetBodyFatPercent),
      bmi: derived.bmi,
      bmiCategory: bmiCategory ?? null,
      pollockSum: derived.pollockSum,
      bodyDensity: derived.bodyDensity,
      bodyFatPercent: derived.bodyFatPercent,
      fatMassKg: derived.fatMassKg,
      leanMassKg: derived.leanMassKg,
      idealBodyMassKg: derived.idealBodyMassKg,
      excessMassKg: derived.excessMassKg,
      kcalDeficit: derived.kcalDeficit,
    });
  }

  async findMe(userId: string) {
    const [profile] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);
    return this.attachBmiCategory(profile ?? null);
  }

  findByUserIdForAdmin(userId: string) {
    return this.findMe(userId);
  }

  async upsertForUser(userId: string, createHealthDto: CreateHealthDto) {
    if (!createHealthDto.birthDate) {
      throw new BadRequestException('birthDate é obrigatório');
    }

    const values = {
      ...this.buildHealthValues(createHealthDto),
      birthDate: createHealthDto.birthDate,
    };
    const derived = this.computeDerivedFields(values);
    const [profile] = await this.databaseService.database
      .insert(healthProfiles)
      .values({
        ...values,
        ...derived,
        userId,
      })
      .onConflictDoUpdate({
        target: healthProfiles.userId,
        targetWhere: sql`${healthProfiles.deletedAt} IS NULL`,
        set: {
          ...values,
          ...derived,
          updatedAt: new Date(),
        },
      })
      .returning();
    await this.recordMeasurement(userId, values);
    await this.birthdayEventsService.syncForUser(userId);
    return this.attachBmiCategory(profile ?? null);
  }

  async upsertForUserAdmin(
    userId: string,
    createHealthDto: CreateHealthDto,
    actor: AuditActor,
  ) {
    const [before] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);

    const updated = await this.upsertForUser(userId, createHealthDto);

    const auditAfter = this.stripBmiCategory(
      updated as Record<string, any> | null,
    );
    await this.auditService.log({
      actorUserId: actor.actorUserId,
      targetUserId: userId,
      entity: 'health',
      entityId: updated?.id ? String(updated.id) : userId,
      action: before ? 'HEALTH_UPDATE' : 'HEALTH_CREATE',
      before: before ?? null,
      after: auditAfter ?? null,
      metadata: {
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });

    return updated;
  }

  async updateForUser(userId: string, updateHealthDto: UpdateHealthDto) {
    const [current] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);

    const values = this.buildHealthValues(updateHealthDto);
    if (!current) {
      if (!updateHealthDto.birthDate) {
        throw new BadRequestException('Perfil de saúde não encontrado');
      }
      const merged = { ...values, birthDate: updateHealthDto.birthDate };
      const derived = this.computeDerivedFields(merged);
      const [created] = await this.databaseService.database
        .insert(healthProfiles)
        .values({
          ...values,
          ...derived,
          userId,
          birthDate: updateHealthDto.birthDate,
        })
        .returning();

      await this.recordMeasurement(userId, merged);
      await this.birthdayEventsService.syncForUser(userId);
      return this.attachBmiCategory(created ?? null);
    }

    const merged = { ...current, ...values };
    const derived = this.computeDerivedFields(merged);

    const [profile] = await this.databaseService.database
      .update(healthProfiles)
      .set({
        ...values,
        ...derived,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .returning();

    await this.recordMeasurement(userId, merged);
    await this.birthdayEventsService.syncForUser(userId);
    return this.attachBmiCategory(profile ?? null);
  }

  async updateForUserAdmin(
    userId: string,
    updateHealthDto: UpdateHealthDto,
    actor: AuditActor,
  ) {
    const [before] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .limit(1);

    const updated = await this.updateForUser(userId, updateHealthDto);
    const auditAfter = this.stripBmiCategory(
      updated as Record<string, any> | null,
    );

    await this.auditService.log({
      actorUserId: actor.actorUserId,
      targetUserId: userId,
      entity: 'health',
      entityId: updated?.id ? String(updated.id) : userId,
      action: 'HEALTH_UPDATE',
      before: before ?? null,
      after: auditAfter ?? null,
      metadata: {
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    });

    return updated;
  }

  async removeForUser(userId: string) {
    const [profile] = await this.databaseService.database
      .update(healthProfiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(healthProfiles.userId, userId),
          isNull(healthProfiles.deletedAt),
        ),
      )
      .returning();
    await this.birthdayEventsService.syncForUser(userId);
    return this.attachBmiCategory(profile ?? null);
  }

  computeFromPayload(payload: ComputeBodyCompositionDto) {
    const result = this.buildComposition(payload);
    if (!result.bmiCategory && result.bmi !== undefined && result.age >= 20) {
      result.bmiCategory = bmiCategoryFromAdult(result.bmi);
    }
    return result;
  }
}
