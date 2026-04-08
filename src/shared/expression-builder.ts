/** Root type aliases: human-readable name → Bubble %x type */
const ROOT_TYPES: Record<string, string> = {
  'Current User': 'CurrentUser',
  'This Thing': 'InjectedValue',
  'Current Date': 'CurrentDate',
  'Current Page': 'CurrentPage',
  'Current Page URL': 'CurrentPageUrl',
  'Current Page Data': 'PageData',
};

export function buildExpression(dsl: string): Record<string, unknown> {
  const trimmed = dsl.trim();

  // Literal boolean
  if (trimmed === 'yes') return { '%x': 'LiteralBoolean', '%v': true };
  if (trimmed === 'no') return { '%x': 'LiteralBoolean', '%v': false };

  // Empty
  if (trimmed === 'empty') return { '%x': 'EmptyValue' };

  // Literal number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { '%x': 'LiteralNumber', '%v': Number(trimmed) };
  }

  // Literal text (quoted)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { '%x': 'LiteralText', '%v': trimmed.slice(1, -1) };
  }

  // Check for root type match (longest match first)
  const sortedRoots = Object.keys(ROOT_TYPES).sort((a, b) => b.length - a.length);
  for (const rootName of sortedRoots) {
    if (trimmed === rootName) {
      return { '%x': ROOT_TYPES[rootName] };
    }
    if (trimmed.startsWith(rootName + "'s ")) {
      const fieldChain = trimmed.slice(rootName.length + 3);
      const root: Record<string, unknown> = { '%x': ROOT_TYPES[rootName] };
      root['%n'] = buildFieldChain(fieldChain);
      return root;
    }
  }

  // Fallback: treat as literal text
  return { '%x': 'LiteralText', '%v': trimmed };
}

function buildFieldChain(chain: string): Record<string, unknown> {
  const parts = chain.split("'s ");
  const node: Record<string, unknown> = { '%x': 'Message', '%nm': parts[0] };
  if (parts.length > 1) {
    node['%n'] = buildFieldChain(parts.slice(1).join("'s "));
  }
  return node;
}

export function buildComparison(
  subjectDsl: string,
  operator: string,
  argumentDsl?: string,
): Record<string, unknown> {
  const subject = buildExpression(subjectDsl);

  const opNode: Record<string, unknown> = { '%x': 'Message', '%nm': operator };
  if (argumentDsl !== undefined) {
    opNode['%a'] = buildExpression(argumentDsl);
  }

  const deepest = findDeepestNode(subject);
  deepest['%n'] = opNode;

  return subject;
}

function findDeepestNode(node: Record<string, unknown>): Record<string, unknown> {
  if (node['%n'] && typeof node['%n'] === 'object') {
    return findDeepestNode(node['%n'] as Record<string, unknown>);
  }
  return node;
}
