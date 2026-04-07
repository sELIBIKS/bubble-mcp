import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function toTypeKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function toFieldKey(name: string, type: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `${slug}_${type}`;
}

export function createCreateDataTypeTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_data_type',
    mode: 'read-write',
    description:
      'Create a new data type in the Bubble app, optionally with initial fields.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      name: z.string().min(1).describe('Display name for the new type (e.g., "Order", "Product")'),
      fields: z
        .array(
          z.object({
            name: z.string().min(1).describe('Field display name'),
            type: z
              .enum([
                'text',
                'number',
                'yes_no',
                'date',
                'geographic_address',
                'image',
                'file',
              ])
              .describe('Field type'),
            is_list: z.boolean().optional().describe('Whether this field holds a list'),
          }),
        )
        .optional()
        .describe('Initial fields to create with the type'),
    },
    async handler(args) {
      const name = args.name as string;
      const fields = (args.fields as Array<{ name: string; type: string; is_list?: boolean }>) || [];

      const def = await loadAppDefinition(editorClient);
      const allTypes = def.getDataTypes();

      const existing = allTypes.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );

      if (existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Type "${name}" already exists`,
              }),
            },
          ],
          isError: true,
        };
      }

      const typeKey = toTypeKey(name);

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: { '%d': name, privacy_role: {} },
          pathArray: ['user_types', typeKey],
        },
      ];

      for (const field of fields) {
        const fieldKey = toFieldKey(field.name, field.type);
        changes.push({
          body: {
            '%d': field.name,
            '%t': field.type,
            '%o': field.is_list ?? false,
          },
          pathArray: ['user_types', typeKey, '%f3', fieldKey],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          name,
          key: typeKey,
          fieldCount: fields.length,
        },
        writeResult,
      });
    },
  };
}
