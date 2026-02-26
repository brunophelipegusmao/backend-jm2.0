import { isValidCpf, normalizeCpf } from './cpf';

describe('cpf utils', () => {
  it('normalizes CPF keeping only digits', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('accepts a valid CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejects CPF with invalid check digits', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it('rejects CPF with repeated digits', () => {
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('rejects CPF with invalid length', () => {
    expect(isValidCpf('123')).toBe(false);
  });
});
