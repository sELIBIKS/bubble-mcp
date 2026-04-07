import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { parsePageElements } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageElementsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_elements',
    mode: 'read-only',
    description:
      'Get all UI elements on a specific page. Optionally filter by element type (e.g. "Group", "Button", "Text", "RepeatingGroup"). Returns element names, types, parent hierarchy, and type counts.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
      element_type: z
        .string()
        .optional()
        .describe('Filter by element type (e.g. "Group", "Button", "Text")'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementType = args.element_type as string | undefined;

      // Resolve page
      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);
      const pageId = def.resolvePageId(pageName);

      if (!pageId) {
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

      // Load element subtree
      let elements: ReturnType<typeof parsePageElements> = [];
      if (pagePath) {
        const elResult = await editorClient.loadPaths([[pagePath, '%el']]);
        const elData = elResult.data?.[0]?.data;
        elements = parsePageElements(elData);
      }

      // Apply type filter if requested
      const filtered = elementType
        ? elements.filter((e) => e.type === elementType)
        : elements;

      // Compute type counts from the full (unfiltered) set
      const typeCounts: Record<string, number> = {};
      for (const el of elements) {
        typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
      }

      return successResult({
        page: pageName,
        elements: filtered.map((el) => ({
          id: el.id,
          name: el.name,
          type: el.type,
          parentId: el.parentId,
        })),
        count: filtered.length,
        typeCounts,
        ...(elementType ? { filter: elementType } : {}),
      });
    },
  };
}
