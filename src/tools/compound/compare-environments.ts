import { BubbleClient } from '../../bubble-client.js';
import type { BubbleConfig, ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface FieldChange {
  dataType: string;
  field: string;
  dev_type: string;
  live_type: string;
}

interface FieldDiff {
  dataType: string;
  field: string;
}

type ClientFactory = (config: BubbleConfig) => { get: (path: string) => Promise<unknown> };

const defaultFactory: ClientFactory = (config) => new BubbleClient(config);

export function createCompareEnvironmentsTool(
  config: BubbleConfig,
  clientFactory: ClientFactory = defaultFactory
): ToolDefinition {
  return {
    name: 'bubble_compare_environments',
    mode: 'read-only',
    description: 'Compares the schema between development and live Bubble environments. Detects new types, removed types, new/removed fields, and changed field types.',
    inputSchema: {},
    async handler(_args) {
      try {
        const devConfig: BubbleConfig = { ...config, environment: 'development' };
        const liveConfig: BubbleConfig = { ...config, environment: 'live' };

        const devClient = clientFactory(devConfig);
        const liveClient = clientFactory(liveConfig);

        const [devSchema, liveSchema] = await Promise.all([
          devClient.get('/meta') as Promise<BubbleSchemaResponse>,
          liveClient.get('/meta') as Promise<BubbleSchemaResponse>,
        ]);

        const devTypes = devSchema.get ?? {};
        const liveTypes = liveSchema.get ?? {};

        const devTypeNames = new Set(Object.keys(devTypes));
        const liveTypeNames = new Set(Object.keys(liveTypes));

        const newTypesInDev = [...devTypeNames].filter(t => !liveTypeNames.has(t));
        const removedInDev = [...liveTypeNames].filter(t => !devTypeNames.has(t));

        const newFields: FieldDiff[] = [];
        const removedFields: FieldDiff[] = [];
        const changedFields: FieldChange[] = [];

        // Compare fields for types that exist in both
        for (const typeName of devTypeNames) {
          if (!liveTypeNames.has(typeName)) continue;

          const devFields = devTypes[typeName] ?? {};
          const liveFields = liveTypes[typeName] ?? {};

          const devFieldNames = new Set(Object.keys(devFields));
          const liveFieldNames = new Set(Object.keys(liveFields));

          for (const field of devFieldNames) {
            if (!liveFieldNames.has(field)) {
              newFields.push({ dataType: typeName, field });
            } else {
              const devType = devFields[field]?.type;
              const liveType = liveFields[field]?.type;
              if (devType !== liveType) {
                changedFields.push({
                  dataType: typeName,
                  field,
                  dev_type: devType ?? '',
                  live_type: liveType ?? '',
                });
              }
            }
          }

          for (const field of liveFieldNames) {
            if (!devFieldNames.has(field)) {
              removedFields.push({ dataType: typeName, field });
            }
          }
        }

        const totalChanges =
          newTypesInDev.length +
          removedInDev.length +
          newFields.length +
          removedFields.length +
          changedFields.length;

        return successResult({
          new_types_in_dev: newTypesInDev,
          removed_in_dev: removedInDev,
          new_fields: newFields,
          removed_fields: removedFields,
          changed_fields: changedFields,
          total_changes: totalChanges,
          in_sync: totalChanges === 0,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
