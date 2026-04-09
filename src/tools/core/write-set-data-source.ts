import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildExpression } from '../../shared/expression-builder.js';
import { resolveElementKey } from '../../shared/resolve-element-key.js';

export function createSetDataSourceTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_set_data_source',
    mode: 'read-write',
    description:
      "Set a dynamic text binding or data source on an element. The expression determines what data is displayed (e.g., \"Current User's email\").",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page containing the element'),
      element_id: z.string().min(1).describe('Element ID to set the data source on'),
      expression: z
        .string()
        .min(1)
        .describe('Data expression in DSL format. Examples: "Current User\'s email", "This Thing\'s name", "Current Date"'),
      preview_text: z
        .string()
        .optional()
        .describe('Editor preview label (shown in the Bubble editor)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementId = args.element_id as string;
      const expression = args.expression as string;
      const previewText = args.preview_text as string | undefined;

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const pathId = pagePath.split('.')[1];

      const resolved = await resolveElementKey(editorClient, pathId, elementId);
      if (!resolved) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Element "${elementId}" not found on page "${pageName}"`,
              }),
            },
          ],
          isError: true,
        };
      }
      const elKey = resolved.key;

      const expr = buildExpression(expression);

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: { '%x': 'TextExpression', '%e': { '0': expr } },
          pathArray: ['%p3', pathId, '%el', elKey, '%p', '%3'],
        },
      ];

      if (previewText !== undefined) {
        changes.push({
          body: previewText,
          pathArray: ['%p3', pathId, '%el', elKey, '%p', 'editor_preview_text'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          pageName,
          elementId,
          expression,
          ...(previewText !== undefined ? { previewText } : {}),
        },
        writeResult,
      });
    },
  };
}
