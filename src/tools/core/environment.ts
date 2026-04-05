import type { BubbleConfig } from '../../types.js';
import type { ToolDefinition } from '../../types.js';
import { successResult } from '../../middleware/error-handler.js';

export function createEnvironmentTool(config: BubbleConfig): ToolDefinition {
  return {
    name: 'bubble_get_environment',
    mode: 'read-only',
    description: 'Return the current server environment configuration: app URL, environment, mode, and rate limit. The API token is never exposed.',
    inputSchema: {},
    async handler(_args) {
      return successResult({
        app_url: config.appUrl,
        environment: config.environment,
        mode: config.mode,
        rate_limit: config.rateLimit,
      });
    },
  };
}
