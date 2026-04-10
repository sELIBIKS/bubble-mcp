import type { EditorClient, EditorChange } from './editor-client.js';
import { AppDefinition } from './app-definition.js';

/**
 * Load an AppDefinition from the editor.
 *
 * On the main version (test/live), getChanges() returns the full app state.
 * On branches, getChanges() only returns the branch delta and loadPaths
 * returns path_version_hashes instead of inline data. We detect this and
 * resolve hashes to get user_types, option_sets, etc.
 */
export async function loadAppDefinition(editorClient: EditorClient): Promise<AppDefinition> {
  const [changes, indexResult] = await Promise.all([
    editorClient.getChanges(0),
    editorClient.loadPaths([
      ['_index', 'page_name_to_id'],
      ['_index', 'page_name_to_path'],
      ['_index', 'custom_name_to_id'],
    ]),
  ]);

  // On branches (version is not 'test' or 'live'), getChanges() only returns
  // the branch delta — user_types/option_sets data must be loaded via hashes.
  const isBranch = editorClient.version !== 'test' && editorClient.version !== 'live';
  let allChanges = changes;

  if (isBranch) {
    const hasTypes = changes.some(c => c.path[0] === 'user_types');
    const hasOptionSets = changes.some(c => c.path[0] === 'option_sets');
    if (!hasTypes || !hasOptionSets) {
      const branchData = await loadHashedData(editorClient, !hasTypes, !hasOptionSets);
      allChanges = [...changes, ...branchData];
    }
  }

  const def = AppDefinition.fromChanges(allChanges);

  const pageNameToId = indexResult.data[0]?.data as Record<string, string> | null;
  const pageNameToPath = indexResult.data[1]?.data as Record<string, string> | null;
  const customNameToId = indexResult.data[2]?.data as Record<string, string> | null;
  def.mergePageIndexes(pageNameToId, pageNameToPath);
  def.mergeReusableElementIndex(customNameToId);

  return def;
}

/**
 * Load user_types and/or option_sets via hash-based resolution.
 * Returns synthetic EditorChange entries that can be fed to AppDefinition.fromChanges().
 */
async function loadHashedData(
  editorClient: EditorClient,
  needTypes: boolean,
  needOptionSets: boolean,
): Promise<EditorChange[]> {
  const pathArrays: string[][] = [];
  const pathNames: string[] = [];
  if (needTypes) { pathArrays.push(['user_types']); pathNames.push('user_types'); }
  if (needOptionSets) { pathArrays.push(['option_sets']); pathNames.push('option_sets'); }

  if (pathArrays.length === 0) return [];

  const result = await editorClient.loadPaths(pathArrays);
  const syntheticChanges: EditorChange[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const entry = result.data[i];
    const root = pathNames[i];
    let data: unknown = entry.data;

    // If hash-only, resolve via loadByHash
    if (!data && entry.path_version_hash) {
      try {
        const resolved = await editorClient.loadByHash(entry.path_version_hash);
        data = resolved.data;
      } catch {
        continue;
      }
    }

    if (!data || typeof data !== 'object') continue;

    // Convert to synthetic changes: one per top-level key
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      syntheticChanges.push({
        last_change_date: 0,
        last_change: 0,
        path: [root, key],
        data: value,
        action: 'overwrite',
      });
    }
  }

  return syntheticChanges;
}
