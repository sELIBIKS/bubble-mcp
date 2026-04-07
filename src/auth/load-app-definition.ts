import type { EditorClient } from './editor-client.js';
import { AppDefinition } from './app-definition.js';

/**
 * Load an AppDefinition with page indexes from both the changes stream
 * and direct loadPaths (since page indexes may not appear in changes
 * for apps where pages were created before the change window).
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

  const def = AppDefinition.fromChanges(changes);

  const pageNameToId = indexResult.data[0]?.data as Record<string, string> | null;
  const pageNameToPath = indexResult.data[1]?.data as Record<string, string> | null;
  const customNameToId = indexResult.data[2]?.data as Record<string, string> | null;
  def.mergePageIndexes(pageNameToId, pageNameToPath);
  def.mergeReusableElementIndex(customNameToId);

  return def;
}
