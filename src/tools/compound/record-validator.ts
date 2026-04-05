import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse, BubbleRecord } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface ValidationIssue {
  record_id: string;
  field: string;
  issue: string;
}

interface SearchResponse {
  response: {
    cursor: number;
    count: number;
    remaining: number;
    results: BubbleRecord[];
  };
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function createRecordValidatorTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_record_validator',
    mode: 'read-only',
    description: 'Validates records of a given Bubble data type by sampling and checking for empty or null fields and fully empty records.',
    inputSchema: {
      dataType: { type: 'string', description: 'The Bubble data type to validate' },
      sample_size: { type: 'number', description: 'Number of records to sample (default 200)' },
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const sampleSize = (args.sample_size as number | undefined) ?? 200;

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const typeFields = Object.keys(schema.get?.[dataType] ?? {});

        const response = await client.get<SearchResponse>(
          `/obj/${dataType}?limit=${sampleSize}&cursor=0`
        );
        const records = response.response?.results ?? [];

        const allIssues: ValidationIssue[] = [];
        let emptyRecords = 0;

        for (const record of records) {
          const emptyFields: string[] = [];

          for (const fieldName of typeFields) {
            const value = record[fieldName];
            if (isEmpty(value)) {
              emptyFields.push(fieldName);
              if (allIssues.length < 100) {
                allIssues.push({
                  record_id: record._id,
                  field: fieldName,
                  issue: 'empty_or_null',
                });
              }
            }
          }

          if (emptyFields.length === typeFields.length && typeFields.length > 0) {
            emptyRecords++;
          }
        }

        return successResult({
          dataType,
          records_sampled: records.length,
          empty_records: emptyRecords,
          total_issues: allIssues.length,
          issues: allIssues.slice(0, 100),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
