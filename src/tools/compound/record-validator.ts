import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import type { SearchResponse } from '../../shared/types.js';
import { validateIdentifier } from '../../shared/validation.js';

interface ValidationIssue {
  record_id: string;
  field: string;
  issue: string;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function createRecordValidatorTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_record_validator',
    mode: 'read-only',
    description:
      'Validates records of a given Bubble data type by sampling and checking for empty or null fields and fully empty records.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type to validate'),
      sample_size: z.number().int().min(1).max(1000).optional().default(200).describe('Number of records to sample (default 200)'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const sampleSize = (args.sample_size as number | undefined) ?? 200;

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const typeFields = Object.keys(schema.get?.[dataType] ?? {});

        const response = await client.get<SearchResponse>(
          `/obj/${dataType}?limit=${sampleSize}&cursor=0`,
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
