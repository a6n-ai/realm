export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// E.164-ish or 10-digit North American. Accepts "+16475550100" or "6475550100".
export function isValidCaPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d+]/g, "");
  return /^\+?1?\d{10}$/.test(digits);
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}
