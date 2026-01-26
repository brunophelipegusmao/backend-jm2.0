export type Sex = 'MALE' | 'FEMALE';

export type FemaleSkinfolds = {
  tricepsMm: number;
  suprailiacMm: number;
  thighMm: number;
};

export type MaleSkinfolds = {
  chestMm: number;
  abdominalMm: number;
  thighMm: number;
};

export type BodyCompositionInput = {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm?: number;
  skinfolds: FemaleSkinfolds | MaleSkinfolds;
  goalBodyFatPct?: number;
};

export type BodyCompositionGoal = {
  goalBodyFatPct: number;
  targetBodyWeightKg: number;
  excessWeightKg: number;
  kcalToGoal: number;
};

export type BodyCompositionResult = {
  protocol: 'pollock-3-siri';
  sex: Sex;
  age: number;
  weightKg: number;
  bmi?: number;
  bmiCategory?: string;
  skinfoldsMm: FemaleSkinfolds | MaleSkinfolds;
  sumSkinfoldsMm: number;
  bodyDensity: number;
  bodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
  goal?: BodyCompositionGoal;
};

export function sumSkinfolds(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

export function bodyDensityPollock3(
  sex: Sex,
  sumSkinfoldsMm: number,
  age: number,
) {
  const sumSquared = sumSkinfoldsMm * sumSkinfoldsMm;
  if (sex === 'MALE') {
    return (
      1.10938 -
      0.0008267 * sumSkinfoldsMm +
      0.0000016 * sumSquared -
      0.0002574 * age
    );
  }
  return (
    1.0994921 -
    0.0009929 * sumSkinfoldsMm +
    0.0000023 * sumSquared -
    0.0001392 * age
  );
}

export function bodyFatPctSiri(bodyDensity: number) {
  return (4.95 / bodyDensity - 4.5) * 100;
}

export function fatMassKg(weightKg: number, bodyFatPct: number) {
  return (weightKg * bodyFatPct) / 100;
}

export function leanMassKg(weightKg: number, fatMassKgValue: number) {
  return weightKg - fatMassKgValue;
}

export function bmiFromHeight(weightKg: number, heightCm: number) {
  const heightM = heightCm / 100;
  if (heightM <= 0) {
    return 0;
  }
  return weightKg / (heightM * heightM);
}

export function bmiCategoryFromAdult(bmi: number) {
  if (bmi < 18.5) return 'Baixo peso';
  if (bmi < 25) return 'Peso adequado (eutrofia)';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III (obesidade grave/mórbida)';
}

export function targetBodyWeightFromGoalPct(
  weightKg: number,
  leanMassKgValue: number,
  goalBodyFatPct: number,
) {
  const targetBodyWeightKg = leanMassKgValue / (1 - goalBodyFatPct / 100);
  const excessWeightKg = weightKg - targetBodyWeightKg;
  const kcalToGoal = excessWeightKg * 7730;
  return { targetBodyWeightKg, excessWeightKg, kcalToGoal };
}

export function computeBodyComposition(
  input: BodyCompositionInput,
): BodyCompositionResult {
  const isMale = input.sex === 'MALE';
  const skinfolds = input.skinfolds;
  const sum = isMale
    ? sumSkinfolds([
        (skinfolds as MaleSkinfolds).chestMm,
        (skinfolds as MaleSkinfolds).abdominalMm,
        (skinfolds as MaleSkinfolds).thighMm,
      ])
    : sumSkinfolds([
        (skinfolds as FemaleSkinfolds).tricepsMm,
        (skinfolds as FemaleSkinfolds).suprailiacMm,
        (skinfolds as FemaleSkinfolds).thighMm,
      ]);

  const density = bodyDensityPollock3(input.sex, sum, input.age);
  const bodyFatPct = bodyFatPctSiri(density);
  const fatMass = fatMassKg(input.weightKg, bodyFatPct);
  const leanMass = leanMassKg(input.weightKg, fatMass);

  const result: BodyCompositionResult = {
    protocol: 'pollock-3-siri',
    sex: input.sex,
    age: input.age,
    weightKg: input.weightKg,
    bmi:
      input.heightCm !== undefined
        ? bmiFromHeight(input.weightKg, input.heightCm)
        : undefined,
    skinfoldsMm: input.skinfolds,
    sumSkinfoldsMm: sum,
    bodyDensity: density,
    bodyFatPct,
    fatMassKg: fatMass,
    leanMassKg: leanMass,
  };

  if (result.bmi !== undefined && input.age >= 20) {
    result.bmiCategory = bmiCategoryFromAdult(result.bmi);
  }

  if (input.goalBodyFatPct !== undefined) {
    const goal = targetBodyWeightFromGoalPct(
      input.weightKg,
      leanMass,
      input.goalBodyFatPct,
    );
    result.goal = {
      goalBodyFatPct: input.goalBodyFatPct,
      targetBodyWeightKg: goal.targetBodyWeightKg,
      excessWeightKg: goal.excessWeightKg,
      kcalToGoal: goal.kcalToGoal,
    };
  }

  return result;
}
