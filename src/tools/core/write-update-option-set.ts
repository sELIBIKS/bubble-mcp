import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createUpdateOptionSetTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_update_option_set',
    mode: 'read-write',
    description:
      'Update an existing option set in the Bubble app. Can rename or replace option values.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      name: z.string().min(1).describe('Option set display name to update'),
      new_name: z.string().optional().describe('New display name'),
      options: z.array(z.string()).optional().describe('New option values (replaces existing)'),
    },
    async handler(args) {
      const name = args.name as string;
      const newName = args.new_name as string | undefined;
      const options = args.options as string[] | undefined;

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

      const rawObj = matched.raw as Record<string, unknown>;
      const updatedBody = {
        ...rawObj,
        '%d': newName ?? rawObj['%d'],
        options: options ?? rawObj['options'] ?? [],
      };

      const writeResult = await editorClient.write([
        {
          body: updatedBody,
          pathArray: ['option_sets', matched.key],
        },
      ]);

      return successResult({
        updated: {
          name: newName ?? matched.name,
          key: matched.key,
          optionCount: (updatedBody.options as unknown[]).length,
        },
        writeResult,
      });
    },
  };
}
