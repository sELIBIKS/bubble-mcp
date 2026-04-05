import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition, SeedTracker } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createCleanupTestDataTool(
  client: BubbleClient,
  seedTracker: SeedTracker,
): ToolDefinition {
  return {
    name: 'bubble_cleanup_test_data',
    mode: 'admin',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Deletes all test records previously created by bubble_seed_data. Processes in reverse dependency order.',
    inputSchema: {},
    async handler(_args) {
      try {
        const deleted: Record<string, number> = {};
        const failures: Array<{ dataType: string; id: string; error: string }> = [];

        // Get all seeded types and reverse for deletion order
        const types = Array.from(seedTracker.seededIds.keys()).reverse();

        for (const typeName of types) {
          const ids = seedTracker.get(typeName);
          let deletedCount = 0;

          for (const id of ids) {
            try {
              await client.delete(`/obj/${typeName}/${id}`);
              deletedCount++;
            } catch (err) {
              failures.push({
                dataType: typeName,
                id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          deleted[typeName] = deletedCount;
        }

        seedTracker.clear();

        return successResult({
          deleted,
          failures,
          total_failures: failures.length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
