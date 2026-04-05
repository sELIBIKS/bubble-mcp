import { readFileSync } from 'node:fs';

export interface TddType {
  name: string;
  fields: Array<{ name: string; type: string }>;
}

export function parseTdd(filePath: string): TddType[] {
  const content = readFileSync(filePath, 'utf-8');
  const types: TddType[] = [];
  // Parse **typename:** blocks followed by - fieldname (type) lines
  const typeBlockRegex = /\*\*([\w ]+):\*\*\s*(?:\([^)]*\))?\n((?:\s*-\s+.+\n?)*)/g;
  let match;
  while ((match = typeBlockRegex.exec(content)) !== null) {
    const typeName = match[1];
    const fieldBlock = match[2];
    const fields: Array<{ name: string; type: string }> = [];
    const fieldRegex = /^\s*-\s+(\S+)\s+\(([^)]+)\)/gm;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(fieldBlock)) !== null) {
      const fieldName = fieldMatch[1].replace(/,\s*$/, '');
      const rawType = fieldMatch[2].split(',')[0].trim();
      fields.push({ name: fieldName, type: rawType });
    }
    types.push({ name: typeName, fields });
  }
  return types;
}
