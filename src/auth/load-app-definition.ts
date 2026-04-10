import type { EditorClient, EditorChange } from './editor-client.js';
import { AppDefinition } from './app-definition.js';

/**
 * Load an AppDefinition from the editor.
 *
 * On the main version (test/live), getChanges() returns the full app state.
 * On branches, getChanges() only returns the branch delta and loadPaths
 * returns path_version_hashes instead of inline data. We detect this and
 * resolve hashes to get user_types, option_sets, pages, and settings.
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
  // the branch delta — user_types/option_sets/settings must be loaded via hashes.
  const isBranch = editorClient.version !== 'test' && editorClient.version !== 'live';
  let allChanges = changes;

  if (isBranch) {
    const branchData = await loadBranchData(editorClient, changes);
    allChanges = [...changes, ...branchData];
  }

  const def = AppDefinition.fromChanges(allChanges);

  const pageNameToId = indexResult.data[0]?.data as Record<string, string> | null;
  const pageNameToPath = indexResult.data[1]?.data as Record<string, string> | null;
  const customNameToId = indexResult.data[2]?.data as Record<string, string> | null;
  def.mergePageIndexes(pageNameToId, pageNameToPath);
  def.mergeReusableElementIndex(customNameToId);

  // On branches, the page index may be incomplete (only shows test-version pages).
  // Use id_to_path to discover all pages created on the branch.
  if (isBranch) {
    await mergeBranchPages(editorClient, def);
    // Ensure all pages have cached data (for element/workflow access on branches)
    await cacheAllPageData(editorClient, def);
  }

  return def;
}

/**
 * Load user_types, option_sets, and settings via hash-based resolution.
 * Returns synthetic EditorChange entries that can be fed to AppDefinition.fromChanges().
 */
async function loadBranchData(
  editorClient: EditorClient,
  existingChanges: EditorChange[],
): Promise<EditorChange[]> {
  const roots = ['user_types', 'option_sets', 'settings'];
  const needed = roots.filter(
    root => !existingChanges.some(c => c.path[0] === root),
  );

  if (needed.length === 0) return [];

  const pathArrays = needed.map(root => [root]);
  const result = await editorClient.loadPaths(pathArrays);
  const syntheticChanges: EditorChange[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const entry = result.data[i];
    const root = needed[i];
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

/**
 * On branches, discover additional pages from id_to_path that aren't in the
 * standard page_name_to_id index. Loads page root data to get names.
 */
async function mergeBranchPages(
  editorClient: EditorClient,
  def: AppDefinition,
): Promise<void> {
  // Load id_to_path (may require hash resolution)
  const result = await editorClient.loadPaths([['_index', 'id_to_path']]);
  let idToPath: Record<string, string> | null = null;

  const entry = result.data[0];
  if (entry?.data && typeof entry.data === 'object') {
    idToPath = entry.data as Record<string, string>;
  } else if (entry?.path_version_hash) {
    try {
      const resolved = await editorClient.loadByHash(entry.path_version_hash);
      if (resolved.data && typeof resolved.data === 'object') {
        idToPath = resolved.data as Record<string, string>;
      }
    } catch { /* hash resolution failed */ }
  }

  if (!idToPath) return;

  // Extract page paths: entries like "bTVnB": "%p3.bTVqf" (depth-1 %p3 paths = pages)
  const existingPaths = new Set(def.getPagePaths().map(p => p.path));
  const newPagePaths: Array<{ id: string; path: string; pathKey: string }> = [];

  for (const [id, path] of Object.entries(idToPath)) {
    if (typeof path !== 'string') continue;
    // Page paths are exactly "%p3.{key}" (no further nesting)
    const match = path.match(/^%p3\.([^.]+)$/);
    if (match && !existingPaths.has(path)) {
      newPagePaths.push({ id, path, pathKey: match[1] });
    }
  }

  if (newPagePaths.length === 0) return;

  // Load page root data to get names
  const pathArrays = newPagePaths.map(p => ['%p3', p.pathKey]);
  const pageResult = await editorClient.loadPaths(pathArrays);

  for (let i = 0; i < newPagePaths.length; i++) {
    let pageData: Record<string, unknown> | null = null;
    const pageEntry = pageResult.data[i];

    if (pageEntry?.data && typeof pageEntry.data === 'object') {
      pageData = pageEntry.data as Record<string, unknown>;
    } else if (pageEntry?.path_version_hash) {
      try {
        const resolved = await editorClient.loadByHash(pageEntry.path_version_hash);
        if (resolved.data && typeof resolved.data === 'object') {
          pageData = resolved.data as Record<string, unknown>;
        }
      } catch { /* skip */ }
    }

    if (pageData) {
      const pageName = (pageData['%nm'] as string) || newPagePaths[i].pathKey;
      def.mergePageIndexes(
        { [pageName]: newPagePaths[i].id },
        { [pageName]: newPagePaths[i].path },
      );
      // Cache the page data (includes inline %el, %wf for branch support)
      def.setPageData(newPagePaths[i].path, pageData);
    }
  }
}

/**
 * Ensure all pages have cached root data (including inline %el, %wf).
 * On branches, separate %el/%wf subtree loading returns hashes without nonces,
 * but the page root data includes elements/workflows inline.
 */
async function cacheAllPageData(
  editorClient: EditorClient,
  def: AppDefinition,
): Promise<void> {
  const pages = def.getPagePaths().filter(p => p.path);
  const uncached = pages.filter(p => !def.getPageData(p.path!));
  if (uncached.length === 0) return;

  const pathArrays = uncached.map(p => p.path!.split('.'));
  const result = await editorClient.loadPaths(pathArrays);

  for (let i = 0; i < uncached.length; i++) {
    const pageData = result.data[i]?.data;
    if (pageData && typeof pageData === 'object') {
      def.setPageData(uncached[i].path!, pageData as Record<string, unknown>);
    }
  }
}
