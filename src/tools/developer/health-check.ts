import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { SENSITIVE_PATTERNS, PII_PATTERNS, EXCLUDED_FIELDS, matchesAny } from '../../shared/constants.js';
import type { SearchResponse } from '../../shared/types.js';

const DEAD_FIELD_THRESHOLD = 0.05;
const SAMPLE_SIZE = 100;

export function createHealthCheckTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_health_check',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Comprehensive health check combining privacy audit and dead field detection. Returns a score (0-100), section breakdowns, and top recommendations.',
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const postTypes = Object.keys(schema.post ?? {});
        const deleteTypes = Object.keys(schema.delete ?? {});

        // --- Privacy section ---
        const privacyIssues: string[] = [];
        for (const [dataType, fields] of Object.entries(getTypes)) {
          for (const fieldName of Object.keys(fields)) {
            if (matchesAny(fieldName, SENSITIVE_PATTERNS)) {
              privacyIssues.push(
                `CRITICAL: "${fieldName}" on "${dataType}" contains sensitive data`,
              );
            } else if (matchesAny(fieldName, PII_PATTERNS)) {
              privacyIssues.push(`WARNING: "${fieldName}" on "${dataType}" may contain PII`);
            }
          }
        }
        const writeExposed = new Set([...postTypes, ...deleteTypes]);
        for (const dataType of writeExposed) {
          privacyIssues.push(`WARNING: "${dataType}" is exposed via API write endpoints`);
        }

        const criticalCount = privacyIssues.filter((i) => i.startsWith('CRITICAL')).length;
        const warnCount = privacyIssues.filter((i) => i.startsWith('WARNING')).length;
        const privacyScore = Math.max(0, 100 - criticalCount * 15 - warnCount * 5);

        // --- Data model section (dead fields) ---
        const dataModelIssues: string[] = [];
        const typeNames = Object.keys(getTypes);

        for (const typeName of typeNames) {
          try {
            const response = await client.get<SearchResponse>(
              `/obj/${typeName}?limit=${SAMPLE_SIZE}&cursor=0`,
            );
            const records = response.response?.results ?? [];
            if (records.length === 0) continue;

            const fields = Object.keys(getTypes[typeName]).filter((f) => !EXCLUDED_FIELDS.has(f));

            for (const fieldName of fields) {
              const populated = records.filter((r) => {
                const v = r[fieldName];
                return v !== null && v !== undefined && v !== '';
              }).length;
              const rate = populated / records.length;
              if (rate < DEAD_FIELD_THRESHOLD) {
                dataModelIssues.push(
                  `Dead field "${fieldName}" on "${typeName}" (${Math.round(rate * 100)}% populated)`,
                );
              }
            }
          } catch (err) {
            dataModelIssues.push(`Could not sample "${typeName}": ${err instanceof Error ? err.message : 'unknown error'}`);
          }
        }

        const dataModelScore = Math.max(0, 100 - Math.floor(dataModelIssues.length * 3));

        const overallScore = Math.round((privacyScore + dataModelScore) / 2);

        // Build top 5 recommendations
        const allIssues = [...privacyIssues, ...dataModelIssues];
        const recommendations = allIssues.slice(0, 5);

        return successResult({
          score: overallScore,
          sections: {
            privacy: { score: privacyScore, issues: privacyIssues },
            data_model: { score: dataModelScore, issues: dataModelIssues },
          },
          recommendations,
          total_types: typeNames.length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
