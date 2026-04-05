import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition, SeedTracker } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface CreateResponse {
  id?: string;
  body?: { id?: string };
}

function resolveRefs(
  record: Record<string, unknown>,
  tracker: SeedTracker
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.startsWith('__ref:')) {
      // Format: __ref:typeName:index
      const parts = value.split(':');
      const typeName = parts[1];
      const index = parseInt(parts[2] ?? '0', 10);
      const ids = tracker.get(typeName);
      resolved[key] = ids[index] ?? null;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function topologicalSortTypes(
  types: string[],
  schema: Record<string, Record<string, { type: string }>>
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

export function createSeedDataTool(
  client: BubbleClient,
  seedTracker: SeedTracker
): ToolDefinition {
  return {
    name: 'bubble_seed_data',
    mode: 'admin',
    description:
      'Creates test seed data in Bubble.io in dependency order. Supports __ref:type:index to reference previously seeded record IDs.',
    inputSchema: {
      seed_definition: z
        .record(z.array(z.record(z.unknown())))
        .describe('Map of dataType to array of record objects to create'),
    },
    async handler(args) {
      try {
        const seedDefinition = args.seed_definition as Record<
          string,
          Array<Record<string, unknown>>
        >;

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const liveTypes = schema.get ?? {};

        const typeNames = Object.keys(seedDefinition);
        const ordered = topologicalSortTypes(typeNames, liveTypes as Record<string, Record<string, { type: string }>>);

        const created: Record<string, { count: number; ids: string[] }> = {};

        for (const typeName of ordered) {
          const records = seedDefinition[typeName];
          if (!records || records.length === 0) continue;

          const ids: string[] = [];
          for (const record of records) {
            const resolved = resolveRefs(record, seedTracker);
            const response = await client.post<CreateResponse>(
              `/obj/${typeName}`,
              resolved
            );
            const id = response.id ?? response.body?.id ?? '';
            if (id) ids.push(id);
          }

          seedTracker.set(typeName, ids);
          created[typeName] = { count: ids.length, ids };
        }

        const total = Object.values(created).reduce((sum, v) => sum + v.count, 0);

        return successResult({ created, total });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
