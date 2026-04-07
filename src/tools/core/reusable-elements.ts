import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createReusableElementsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_reusable_elements',
    mode: 'read-only',
    description:
      'List reusable elements (components) in the Bubble app. Use detail="names" (default) for names only, or detail="full" for names with IDs.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      element_name: z
        .string()
        .optional()
        .describe('Filter to a specific reusable element by name. Omit to list all.'),
      detail: z
        .enum(['names', 'full'])
        .optional()
        .describe('"names" (default) returns names only. "full" loads element trees via the editor.'),
    },
    async handler(args) {
      const elementName = args.element_name as string | undefined;
      const detail = (args.detail as string) || 'names';

      const def = await loadAppDefinition(editorClient);
      let names = def.getReusableElementNames();

      if (names.length === 0) {
        return successResult({
          reusableElements: [],
          count: 0,
          note: 'No reusable elements defined in this app',
        });
      }

      if (elementName) {
        const lower = elementName.toLowerCase();
        names = names.filter((n) => n.toLowerCase() === lower);
        if (names.length === 0) {
          const available = def.getReusableElementNames();
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Reusable element "${elementName}" not found`,
                  hint: `Available reusable elements: ${available.join(', ')}`,
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (detail === 'full') {
        const index = def.getReusableElementIndex();
        const elements = names.map((name) => ({
          name,
          id: index.get(name) || null,
        }));
        return successResult({ reusableElements: elements, count: elements.length });
      }

      return successResult({ reusableElements: names, count: names.length });
    },
  };
}
