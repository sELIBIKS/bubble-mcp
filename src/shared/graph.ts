export interface GraphNode {
  name: string;
  fields: Array<{ name: string; type: string }>;
}

export function topologicalSort<T extends GraphNode>(types: T[]): T[] {
  const nameToType = new Map<string, T>();
  for (const t of types) nameToType.set(t.name, t);

  const visited = new Set<string>();
  const sorted: T[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const t = nameToType.get(name);
    if (!t) return;
    for (const field of t.fields) {
      if (field.type.startsWith('custom.')) {
        const dep = field.type.slice('custom.'.length);
        if (nameToType.has(dep)) visit(dep);
      }
    }
    sorted.push(t);
  }

  for (const t of types) visit(t.name);
  return sorted;
}

export function topologicalSortTypes(
  types: string[],
  schema: Record<string, Record<string, { type: string }>>,
): string[] {
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const fields = schema[name] ?? {};
    for (const fieldDef of Object.values(fields)) {
      if (fieldDef.type?.startsWith('custom.')) {
        const dep = fieldDef.type.slice('custom.'.length);
        if (types.includes(dep)) visit(dep);
      }
    }
    sorted.push(name);
  }

  for (const t of types) visit(t);
  return sorted;
}
