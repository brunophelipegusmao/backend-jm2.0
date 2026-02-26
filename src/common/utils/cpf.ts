export const CPF_DIGITS_REGEX = /^\d{11}$/;
const CPF_REPEATED_DIGITS_REGEX = /^(\d)\1{10}$/;

export const CPF_FORMAT_ERROR_MESSAGE = 'CPF deve conter 11 digitos numericos';
export const CPF_INVALID_ERROR_MESSAGE = 'CPF invalido';

export const normalizeCpf = (value: string) => value.replace(/\D/g, '');

const calculateCpfCheckDigit = (baseDigits: string) => {
  let sum = 0;
  for (let index = 0; index < baseDigits.length; index += 1) {
    const digit = Number(baseDigits[index]);
    sum += digit * (baseDigits.length + 1 - index);
  }

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const isValidCpf = (value: string) => {
  const cpf = normalizeCpf(value);

  if (!CPF_DIGITS_REGEX.test(cpf)) {
    return false;
  }

  if (CPF_REPEATED_DIGITS_REGEX.test(cpf)) {
    return false;
  }

  const firstDigit = calculateCpfCheckDigit(cpf.slice(0, 9));
  const secondDigit = calculateCpfCheckDigit(cpf.slice(0, 10));

  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
};
