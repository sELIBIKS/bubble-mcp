import { resolve, normalize, sep } from 'node:path';

const SAFE_IDENTIFIER = /^[a-zA-Z0-9_ -]+$/;

export function validateIdentifier(value: string, label: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(
      `Invalid ${label}: "${value}". Only letters, numbers, underscores, hyphens, and spaces are allowed.`,
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
