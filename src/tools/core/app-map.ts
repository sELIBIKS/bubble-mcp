import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createAppMapTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_app_map',
    mode: 'read-only',
    description:
      'Generate a cross-cutting dependency map of the Bubble app showing data type relationships, pages, API connectors, and option sets. Use focus to narrow the output.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      focus: z
        .enum(['data_types', 'pages', 'all'])
        .optional()
        .describe(
          '"data_types" shows type-to-type relationships. "pages" shows pages with their paths. "all" (default) shows everything.',
        ),
    },
    async handler(args) {
      const focus = (args.focus as string) || 'all';
      const def = await loadAppDefinition(editorClient);

      const result: Record<string, unknown> = {};

      if (focus === 'all' || focus === 'data_types') {
        const types = def.getDataTypes();
        const typeMap: Record<string, { fieldCount: number; referencedTypes: string[] }> = {};

        for (const t of types) {
          const referencedTypes: string[] = [];
          if (t.deepFields) {
            for (const f of t.deepFields) {
              if (f.fieldType.startsWith('custom_')) {
                referencedTypes.push(f.fieldType.replace('custom_', ''));
              }
            }
          }
          typeMap[t.name] = {
            fieldCount: t.deepFields?.length ?? Object.keys(t.fields).length,
            referencedTypes: [...new Set(referencedTypes)],
          };
        }
        result.dataTypes = typeMap;
      }

      if (focus === 'all' || focus === 'pages') {
        result.pages = def.getPagePaths();
      }

      if (focus === 'all') {
        const connectors = def.getApiConnectors();
        result.apiConnectors = connectors.map((c) => c.name);

        const optionSets = def.getOptionSets();
        result.optionSets = optionSets.map((s) => s.name);

        result.summary = {
          ...def.getSummary(),
        };
      }

      return successResult(result);
    },
  };
}
