export const subscriptionStatusValues = [
  'active',
  'paused',
  'cancelled',
  'finished',
] as const;

export const receivableStatusValues = [
  'open',
  'paid',
  'overdue',
  'cancelled',
  'renegotiated',
] as const;

export const receivableKindValues = [
  'regular',
  'prorated',
  'adjustment',
] as const;

export const paymentMethodValues = [
  'pix',
  'card',
  'cash',
  'transfer',
  'other',
] as const;

export const paymentSourceValues = ['manual', 'gateway'] as const;

export const subscriptionDueDateModeValues = [
  'fixed_day',
  'custom_date',
] as const;

export const subscriptionProrationModeValues = [
  'first_month_prorated',
  'none',
  'full_first_month',
] as const;

export const subscriptionProrationBaseValues = [
  'calendar_month',
  '30_days',
] as const;

export const expenseStatusValues = [
  'planned',
  'approved',
  'paid',
  'cancelled',
] as const;

export const expenseCategoryValues = [
  'rent',
  'payroll',
  'utilities',
  'marketing',
  'software',
  'equipment',
  'maintenance',
  'taxes',
  'other',
] as const;
