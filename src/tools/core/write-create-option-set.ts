import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function toKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createCreateOptionSetTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_option_set',
    mode: 'read-write',
    description:
      'Create a new option set in the Bubble app, optionally with initial option values.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      name: z.string().min(1).describe('Display name for the option set'),
      attributes: z
        .array(
          z.object({
            name: z.string().min(1).describe('Attribute display name'),
            type: z
              .enum(['text', 'number', 'boolean', 'image', 'file'])
              .describe('Attribute type'),
          }),
        )
        .optional()
        .describe('Custom attributes (like fields on each option)'),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              value: z.string().min(1).describe('Option display name / db value'),
            }).catchall(z.unknown()),
          ]),
        )
        .optional()
        .describe(
          'Initial options. Pass strings for simple values, or objects with { value, ...attributes } to set attribute values.',
        ),
    },
    async handler(args) {
      const name = args.name as string;
      const attributes = (args.attributes as Array<{ name: string; type: string }>) || [];
      const rawOptions = (args.options as Array<string | Record<string, unknown>>) || [];

      const def = await loadAppDefinition(editorClient);
      const allSets = def.getOptionSets();

      const existing = allSets.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );

      if (existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Option set "${name}" already exists`,
              }),
            },
          ],
          isError: true,
        };
      }

      const key = toKey(name);

      // Phase 1: Create option set structure (set + attributes + values)
      const structureChanges: { body: unknown; pathArray: string[] }[] = [
        {
          body: { '%d': name, creation_source: 'editor' },
          pathArray: ['option_sets', key],
        },
      ];

      // Create attribute definitions
      const attrKeyMap = new Map<string, string>();
      for (const attr of attributes) {
        const attrKey = toKey(attr.name);
        attrKeyMap.set(attr.name, attrKey);
        structureChanges.push({
          body: { '%d': attr.name, '%v': attr.type, creation_source: 'editor' },
          pathArray: ['option_sets', key, 'attributes', attrKey],
        });
      }

      // Create option values (without attribute data — must be separate write)
      const valueIds: string[] = [];
      for (let i = 0; i < rawOptions.length; i++) {
        const opt = rawOptions[i];
        const isString = typeof opt === 'string';
        const display = isString ? opt : (opt.value as string);
        const valueId = toKey(display);
        valueIds.push(valueId);

        structureChanges.push({
          body: { sort_factor: i + 1, '%d': display },
          pathArray: ['option_sets', key, 'values', valueId],
        });
      }

      await editorClient.write(structureChanges);

      // Phase 2: Set attribute values (separate write so they don't merge into value body)
      const attrChanges: { body: unknown; pathArray: string[] }[] = [];
      for (let i = 0; i < rawOptions.length; i++) {
        const opt = rawOptions[i];
        if (typeof opt === 'string') continue;
        for (const [attrName, attrKey] of attrKeyMap) {
          if (attrName in opt) {
            attrChanges.push({
              body: opt[attrName],
              pathArray: ['option_sets', key, 'values', valueIds[i], attrKey],
            });
          }
        }
      }

      const writeResult = attrChanges.length > 0
        ? await editorClient.write(attrChanges)
        : { last_change: '0', last_change_date: '0', id_counter: '0' };

      return successResult({
        created: {
          name,
          key,
          attributeCount: attributes.length,
          optionCount: rawOptions.length,
        },
        writeResult,
      });
    },
  };
}
