export interface ExpressionDef {
  type: string;
  fieldName?: string;
  children: ExpressionDef[];
  argument?: ExpressionDef;
  value?: unknown;
  unknownKeys: string[];
  raw: unknown;
}

const KNOWN_KEYS = new Set(['%x', '%n', '%nm', '%a', '%v', '%d', '%t', '%c', '%p']);

/**
 * Parse a Bubble internal expression object into a structured ExpressionDef.
 * Returns null if the input is not a valid expression (no %x key).
 */
export function parseExpression(raw: unknown): ExpressionDef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const type = obj['%x'] as string | undefined;
  if (!type) {
    return null;
  }

  const unknownKeys: string[] = [];
  for (const key of Object.keys(obj)) {
    if (key.startsWith('%') && !KNOWN_KEYS.has(key)) {
      unknownKeys.push(key);
    }
  }

  const children: ExpressionDef[] = [];
  let argument: ExpressionDef | undefined;
  let value: unknown;

  // %n is the next node in the chain (field access or method call)
  if (obj['%n']) {
    const child = parseExpression(obj['%n']);
    if (child) {
      // Inherit the field name from the child's own %nm
      const childObj = obj['%n'] as Record<string, unknown>;
      child.fieldName = childObj['%nm'] as string | undefined;
      children.push(child);
    }
  }

  // %a is an argument expression (e.g., the right side of "equals")
  if (obj['%a']) {
    argument = parseExpression(obj['%a']) ?? undefined;
  }

  // %v is a literal value
  if (obj['%v'] !== undefined) {
    value = obj['%v'];
  }

  return { type, children, argument, value, unknownKeys, raw };
}

/** Map of internal %x type names to human-readable labels. */
const TYPE_LABELS: Record<string, string> = {
  CurrentUser: 'Current User',
  InjectedValue: 'This Thing',
  LiteralText: '',
  LiteralNumber: '',
  LiteralBoolean: '',
  EmptyValue: 'empty',
  CurrentDate: 'Current Date/Time',
  CurrentPageUrl: 'Current Page URL',
  CurrentPage: 'Current Page',
  PageData: 'Current Page Data',
};

/**
 * Convert a raw Bubble expression to a human-readable string.
 * Returns empty string for null/invalid input.
 */
export function expressionToString(raw: unknown): string {
  const expr = parseExpression(raw);
  if (!expr) {
    return '';
  }
  return renderExpression(expr);
}

function renderExpression(expr: ExpressionDef): string {
  const parts: string[] = [];

  // Render the root type
  if (expr.type === 'LiteralText' && expr.value !== undefined) {
    return `"${String(expr.value)}"`;
  }
  if (expr.type === 'LiteralNumber' && expr.value !== undefined) {
    return String(expr.value);
  }
  if (expr.type === 'LiteralBoolean' && expr.value !== undefined) {
    return expr.value ? 'yes' : 'no';
  }

  const label = TYPE_LABELS[expr.type];
  if (label !== undefined) {
    if (label) parts.push(label);
  } else {
    // Unknown type — return as-is
    parts.push(expr.type);
  }

  // Render the chain
  for (const child of expr.children) {
    const childStr = renderChainNode(child);
    if (childStr) {
      if (parts.length > 0 && child.fieldName) {
        parts.push("'s");
      }
      parts.push(childStr);
    }
  }

  return parts.join(' ').replace(/ 's /g, "'s ").replace(/^ 's /, "'s ").trim();
}

function renderChainNode(expr: ExpressionDef): string {
  const parts: string[] = [];

  if (expr.fieldName) {
    parts.push(expr.fieldName);
  }

  // If this node has an argument, render it inline
  if (expr.argument) {
    const argStr = renderExpression(expr.argument);
    if (argStr) {
      parts.push(argStr);
    }
  }

  // Continue the chain
  for (const child of expr.children) {
    const childStr = renderChainNode(child);
    if (childStr) {
      parts.push(childStr);
    }
  }

  return parts.join(' ');
}
