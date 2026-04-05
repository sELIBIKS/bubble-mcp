import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse, BubbleRecord } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

const EXCLUDED_FIELDS = new Set(['_id', 'Created Date', 'Modified Date', 'Created By']);

interface FieldStat {
  name: string;
  population_rate: number;
  populated_count: number;
  sample_values: unknown[];
  is_dead: boolean;
}

interface SearchResponse {
  response: {
    cursor: number;
    count: number;
    remaining: number;
    results: BubbleRecord[];
  };
}

export function createFieldUsageTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_field_usage',
    mode: 'read-only',
    description: 'Samples records of a Bubble data type and calculates field population rates. Identifies dead fields (populated in less than 5% of records).',
    inputSchema: {
      dataType: { type: 'string', description: 'The Bubble data type to analyse' },
      sample_size: { type: 'number', description: 'Number of records to sample (default 500)' },
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const sampleSize = (args.sample_size as number | undefined) ?? 500;

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const typeFields = Object.keys(schema.get?.[dataType] ?? {}).filter(
          f => !EXCLUDED_FIELDS.has(f)
        );

        const response = await client.get<SearchResponse>(
          `/obj/${dataType}?limit=${sampleSize}&cursor=0`
        );
        const records = response.response?.results ?? [];
        const total = records.length;

        const stats: FieldStat[] = typeFields.map(fieldName => {
          const sampleValues: unknown[] = [];
          let populatedCount = 0;

          for (const record of records) {
            const value = record[fieldName];
            if (value !== null && value !== undefined && value !== '') {
              populatedCount++;
              if (sampleValues.length < 3) {
                sampleValues.push(value);
              }
            }
          }

          const populationRate = total > 0 ? populatedCount / total : 0;
          return {
            name: fieldName,
            population_rate: populationRate,
            populated_count: populatedCount,
            sample_values: sampleValues,
            is_dead: populationRate < 0.05,
          };
        });

        // Sort ascending by population_rate
        stats.sort((a, b) => a.population_rate - b.population_rate);

        const deadFields = stats.filter(f => f.is_dead).map(f => f.name);

        return successResult({
          dataType,
          records_sampled: total,
          fields: stats,
          dead_fields: deadFields,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
