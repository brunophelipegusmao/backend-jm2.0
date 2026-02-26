import { z } from 'zod';
import {
  CPF_DIGITS_REGEX,
  CPF_FORMAT_ERROR_MESSAGE,
  CPF_INVALID_ERROR_MESSAGE,
  isValidCpf,
  normalizeCpf,
} from '../utils/cpf';

export const cpfSchema = z
  .string()
  .trim()
  .transform((value) => normalizeCpf(value))
  .refine((value) => CPF_DIGITS_REGEX.test(value), {
    message: CPF_FORMAT_ERROR_MESSAGE,
  })
  .refine((value) => isValidCpf(value), {
    message: CPF_INVALID_ERROR_MESSAGE,
  });
