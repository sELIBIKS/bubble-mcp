import { resolve, normalize, sep } from 'node:path';

const SAFE_NAME = /^[a-zA-Z0-9_ -]+$/;
const SAFE_RECORD_ID = /^[a-zA-Z0-9_.-]+$/;

export function validateIdentifier(value: string, label: string): string {
  const pattern = label === 'id' ? SAFE_RECORD_ID : SAFE_NAME;
  if (!pattern.test(value)) {
    throw new Error(
      label === 'id'
        ? `Invalid ${label}: "${value}". Only alphanumeric characters, underscores, hyphens, and dots are allowed.`
        : `Invalid ${label}: "${value}". Only letters, numbers, underscores, hyphens, and spaces are allowed.`,
    );
  }
  return value;
}

export function validateFilePath(filePath: string, allowedDir?: string): string {
  const resolved = resolve(filePath);
  if (allowedDir) {
    const normalizedAllowed = normalize(allowedDir);
    if (resolved !== normalizedAllowed && !resolved.startsWith(normalizedAllowed + sep)) {
      throw new Error(
        `Path "${filePath}" is outside the allowed directory. Files must be within "${allowedDir}".`,
      );
    }
  }
  return resolved;
}
