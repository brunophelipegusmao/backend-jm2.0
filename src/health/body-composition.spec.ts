import {
  bodyDensityPollock3,
  bodyFatPctSiri,
  computeBodyComposition,
  sumSkinfolds,
} from './body-composition';

describe('body composition', () => {
  it('calculates female example', () => {
    const sum = sumSkinfolds([12, 16, 25]);
    const density = bodyDensityPollock3('FEMALE', sum, 22);
    const bodyFatPct = bodyFatPctSiri(density);

    expect(sum).toBe(53);
    expect(density).toBeCloseTo(1.0502667, 6);
    expect(bodyFatPct).toBeCloseTo(21.31, 2);

    const result = computeBodyComposition({
      sex: 'FEMALE',
      age: 22,
      weightKg: 58,
      skinfolds: { tricepsMm: 12, suprailiacMm: 16, thighMm: 25 },
      goalBodyFatPct: 18,
    });

    expect(result.fatMassKg).toBeCloseTo(12.36, 2);
    expect(result.leanMassKg).toBeCloseTo(45.64, 2);
    expect(result.goal?.targetBodyWeightKg).toBeCloseTo(55.66, 2);
    expect(result.goal?.excessWeightKg).toBeCloseTo(2.34, 2);
    expect(result.goal?.kcalToGoal).toBeCloseTo(18091, 0);
  });

  it('calculates male example', () => {
    const sum = sumSkinfolds([16, 5, 25]);
    const density = bodyDensityPollock3('MALE', sum, 22);
    const bodyFatPct = bodyFatPctSiri(density);

    expect(sum).toBe(46);
    expect(density).toBeCloseTo(1.0690746, 6);
    expect(bodyFatPct).toBeCloseTo(13.02, 2);

    const result = computeBodyComposition({
      sex: 'MALE',
      age: 22,
      weightKg: 58,
      skinfolds: { chestMm: 16, abdominalMm: 5, thighMm: 25 },
      goalBodyFatPct: 11,
    });

    expect(result.fatMassKg).toBeCloseTo(7.55, 2);
    expect(result.leanMassKg).toBeCloseTo(50.45, 2);
    expect(result.goal?.targetBodyWeightKg).toBeCloseTo(56.69, 2);
    expect(result.goal?.excessWeightKg).toBeCloseTo(1.31, 2);
    expect(result.goal?.kcalToGoal).toBeCloseTo(10162, 0);
  });
});
