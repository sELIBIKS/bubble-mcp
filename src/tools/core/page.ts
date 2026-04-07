import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { parsePageWorkflows } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page',
    mode: 'read-only',
    description:
      'Get detailed information about a specific page in the Bubble app, including its workflows. Use bubble_get_page_list first to discover available page names.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
    },
    async handler(args) {
      const pageName = args.page_name as string;

      // Resolve page name to path
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

      // Load workflow subtree: %p3.<pageId>/%wf
      let workflows: ReturnType<typeof parsePageWorkflows> = [];
      if (pagePath) {
        const pathPrefix = pagePath; // e.g. "%p3.bTGbC"
        const wfResult = await editorClient.loadPaths([[pathPrefix, '%wf']]);
        const wfData = wfResult.data?.[0]?.data;
        workflows = parsePageWorkflows(wfData);
      }

      return successResult({
        name: pageName,
        id: pageId,
        path: pagePath,
        workflows: workflows.map((wf) => ({
          id: wf.id,
          eventType: wf.eventType,
          actions: wf.actions.map((a) => ({
            type: a.type,
            properties: a.properties,
          })),
          condition: wf.conditionReadable,
        })),
        workflowCount: workflows.length,
      });
    },
  };
}
