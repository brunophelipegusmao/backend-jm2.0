import { BadRequestException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { healthProfiles } from '../../drizzle/schema/health';
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

@Injectable()
export class HealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  private toNumber(value: number | string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  }

  private toNumericString(value: number | string | null | undefined) {
    const numeric = this.toNumber(value);
    return numeric === null ? undefined : numeric.toString();
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

  private bmiCategoryForProfile(birthDate?: string | Date | null, bmi?: string | null) {
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

  private attachBmiCategory<T extends { birthDate?: any; bmi?: any }>(profile: T | null) {
    if (!profile) {
      return profile;
    }
    const bmiCategory = this.bmiCategoryForProfile(profile.birthDate, profile.bmi);
    return { ...profile, bmiCategory };
  }

  private computeDerivedFields(input: HealthInput) {
    const derived: Record<string, string> = {};
    const weight = this.toNumber(input.weightKg);
    const height = this.toNumber(input.heightCm);

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
    return {
      ...payload,
      heightCm: this.toNumericString(payload.heightCm),
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

    return computeBodyComposition({
      sex,
      age,
      weightKg: payload.weightKg,
      heightCm: payload.heightCm,
      skinfolds,
      goalBodyFatPct: payload.goalBodyFatPct,
    });
  }

  async findMe(userId: string) {
    const [profile] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1);
    return this.attachBmiCategory(profile ?? null);
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
        set: {
          ...values,
          ...derived,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.attachBmiCategory(profile ?? null);
  }

  async updateForUser(userId: string, updateHealthDto: UpdateHealthDto) {
    const [current] = await this.databaseService.database
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1);

    if (!current) {
      throw new BadRequestException('Perfil de saúde não encontrado');
    }

    const values = this.buildHealthValues(updateHealthDto);
    const merged = { ...current, ...values };
    const derived = this.computeDerivedFields(merged);

    const [profile] = await this.databaseService.database
      .update(healthProfiles)
      .set({
        ...values,
        ...derived,
        updatedAt: new Date(),
      })
      .where(eq(healthProfiles.userId, userId))
      .returning();

    return this.attachBmiCategory(profile ?? null);
  }

  async removeForUser(userId: string) {
    const [profile] = await this.databaseService.database
      .delete(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .returning();
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
