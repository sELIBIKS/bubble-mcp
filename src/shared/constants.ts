export const CHARACTER_LIMIT = 50_000;

export const EXCLUDED_FIELDS = new Set([
  '_id',
  'Created Date',
  'Modified Date',
  'Created By',
]);

export const SENSITIVE_PATTERNS = [
  'password',
  'token',
  'secret',
  'api_key',
  'ssn',
  'credit_card',
  'cvv',
  'pin',
];

export const PII_PATTERNS = ['email', 'phone', 'address', 'dob'];

export function matchesAny(fieldName: string, patterns: string[]): boolean {
  const lower = fieldName.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export function truncateResponse(data: unknown): {
  data: unknown;
  truncated: boolean;
  truncation_message?: string;
} {
  if (JSON.stringify(data).length <= CHARACTER_LIMIT) {
    return { data, truncated: false };
  }
  // Iteratively halve the largest array until under limit
  if (typeof data === 'object' && data !== null) {
    let current = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(current)) {
      if (!Array.isArray(value) || value.length <= 1) continue;
      const originalLength = value.length;
      let reduced = value;
      while (reduced.length > 1 && JSON.stringify({ ...current, [key]: reduced }).length > CHARACTER_LIMIT) {
        reduced = reduced.slice(0, Math.ceil(reduced.length / 2));
      }
      if (reduced.length < originalLength) {
        return {
          data: { ...current, [key]: reduced },
          truncated: true,
          truncation_message: `Response truncated: "${key}" reduced from ${originalLength} to ${reduced.length} items. Use pagination or filters to see more.`,
        };
      }
    }
  }
  return {
    data: '[Response too large. Use filters or pagination to reduce results.]',
    truncated: true,
  };
}
