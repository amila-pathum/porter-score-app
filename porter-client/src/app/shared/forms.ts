import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Password policy mirrored from the API: ≥ 8 characters with at least one letter and one number. */
export const passwordPolicy: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const v = String(control.value ?? '');
  if (!v) return null;
  const errors: ValidationErrors = {};
  if (v.length < 8) errors['minlength'] = true;
  if (!/[a-zA-Z]/.test(v)) errors['letter'] = true;
  if (!/\d/.test(v)) errors['digit'] = true;
  return Object.keys(errors).length ? errors : null;
};

export type PasswordStrength = { level: 0 | 1 | 2 | 3; label: string };

export function passwordStrength(value: string): PasswordStrength {
  if (!value) return { level: 0, label: '' };
  let level = 0;
  if (value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value)) level = 2;
  else if (value.length >= 6) level = 1;
  if (level === 2 && value.length >= 12 && /[^a-zA-Z0-9]/.test(value)) level = 3;
  return { level: level as PasswordStrength['level'], label: ['', 'Too weak', 'Good', 'Strong'][level] };
}

/** First human message for a control's client-side errors. */
export function controlMessage(control: AbstractControl | null, labels: Record<string, string> = {}): string | null {
  if (!control?.errors) return null;
  const e = control.errors;
  const pick = (key: string, fallback: string) => (key in e ? (labels[key] ?? fallback) : null);
  return (
    pick('server', String(e['server'])) ??
    pick('required', 'This field is required') ??
    pick('email', 'Enter a full email, like name@example.com') ??
    pick('minlength', 'Use at least 8 characters') ??
    pick('letter', 'Use at least one letter') ??
    pick('digit', 'Use at least one number') ??
    pick('maxlength', 'That is too long') ??
    'This value is invalid'
  );
}
