import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createUpdateOptionSetTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_update_option_set',
    mode: 'read-write',
    description:
      'Update an existing option set in the Bubble app. Can rename or add new option values.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      name: z.string().min(1).describe('Option set display name to update'),
      new_name: z.string().optional().describe('New display name'),
      add_options: z
        .array(z.string())
        .optional()
        .describe('Option values to add'),
    },
    async handler(args) {
      const name = args.name as string;
      const newName = args.new_name as string | undefined;
      const addOptions = args.add_options as string[] | undefined;

      const def = await loadAppDefinition(editorClient);
      const allSets = def.getOptionSets();

      const matched = allSets.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );

      if (!matched) {
        const available = allSets.map((s) => s.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Option set "${name}" not found`,
                hint: `Available option sets: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const changes: { body: unknown; pathArray: string[] }[] = [];

      // Rename if requested
      if (newName) {
        changes.push({
          body: newName,
          pathArray: ['option_sets', matched.key, '%d'],
        });
      }

      // Add new option values
      if (addOptions && addOptions.length > 0) {
        // Get a rough sort_factor starting point (existing count + 1)
        const existingCount = matched.options?.length ?? 0;
        for (let i = 0; i < addOptions.length; i++) {
          const valueId = generateId();
          changes.push({
            body: {
              sort_factor: existingCount + i + 1,
              '%d': addOptions[i],
              db_value: addOptions[i],
            },
            pathArray: ['option_sets', matched.key, 'values', valueId],
          });
        }
      }

      if (changes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No changes specified. Provide new_name or add_options.',
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        updated: {
          name: newName ?? matched.name,
          key: matched.key,
        },
        writeResult,
      });
    },
  };
}
