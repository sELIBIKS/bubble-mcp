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
  const json = JSON.stringify(data);
  if (json.length <= CHARACTER_LIMIT) {
    return { data, truncated: false };
  }
  // If it's an object with an array property, try to reduce array size
  if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 10) {
        const reduced = value.slice(0, Math.ceil(value.length / 2));
        const truncated = { ...data, [key]: reduced };
        return {
          data: truncated,
          truncated: true,
          truncation_message: `Response truncated: "${key}" reduced from ${value.length} to ${reduced.length} items. Use pagination or filters to see more.`,
        };
      }
    }
  }
  // Fallback: return a size message instead of broken JSON
  return {
    data: `[Response too large to display: ${json.length} characters. Use filters or pagination to reduce results.]`,
    truncated: true,
    truncation_message: `Response truncated. Original size: ${json.length} characters.`,
  };
}
