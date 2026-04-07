import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function toKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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
      options: z.array(z.string()).optional().describe('Initial option values'),
    },
    async handler(args) {
      const name = args.name as string;
      const options = (args.options as string[]) || [];

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

      const writeResult = await editorClient.write([
        {
          body: { '%d': name, options },
          pathArray: ['option_sets', key],
        },
      ]);

      return successResult({
        created: { name, key, optionCount: options.length },
        writeResult,
      });
    },
  };
}
