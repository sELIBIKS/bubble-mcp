import type { BubbleConfig } from '../../types.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createSwaggerTool(config: BubbleConfig): ToolDefinition {
  return {
    name: 'bubble_swagger_docs',
    mode: 'read-only',
    description:
      'Fetches the Swagger/OpenAPI spec for the connected Bubble.io app. Returns available API endpoints, data types, and their schemas. Use this to understand what operations and fields are available before making API calls.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler(_args) {
      try {
        const swaggerUrl = `${config.appUrl}/api/1.1/meta/swagger.json`;
        const response = await fetch(swaggerUrl);

        if (!response.ok) {
          if (response.status === 404 || response.status === 403) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Swagger docs are not available.',
                    hint: 'Enable Swagger documentation in your Bubble app: Settings → API → check "Enable Swagger documentation". Then retry.',
                    url: swaggerUrl,
                  }),
                },
              ],
              isError: true,
            };
          }
          throw new Error(`Failed to fetch Swagger docs: HTTP ${response.status}`);
        }

        const swagger = await response.json();
        return successResult(swagger);
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Could not reach Swagger endpoint.',
                  hint: `Check that the app URL "${config.appUrl}" is correct and accessible.`,
                }),
              },
            ],
            isError: true,
          };
        }
        return handleToolError(error);
      }
    },
  };
}
