import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageListTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_list',
    mode: 'read-only',
    description:
      'List all pages in the Bubble app. Use detail="names" (default) for page names only, or detail="full" for page names with IDs and internal paths.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      detail: z
        .enum(['names', 'full'])
        .optional()
        .describe('Level of detail: "names" (default) or "full" with IDs and paths'),
    },
    async handler(args) {
      const detail = (args.detail as string) || 'names';
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);

      if (detail === 'full') {
        const pagePaths = def.getPagePaths();
        return successResult({
          pages: pagePaths,
          count: pagePaths.length,
        });
      }

      const names = def.getPageNames();
      return successResult({
        pages: names,
        count: names.length,
      });
    },
  };
}
