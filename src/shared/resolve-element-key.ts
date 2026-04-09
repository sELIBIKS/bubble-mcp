import type { EditorClient } from '../auth/editor-client.js';

/**
 * Resolve an element ID (what users see) to its element key (the path segment
 * used in editor paths like ['%p3', pathId, '%el', KEY]).
 *
 * The editor stores elements keyed by a random 5-char key, with the element's
 * `id` field inside the object. Users see the `id` from page-elements output,
 * but editor paths use the key.
 *
 * Scans the changes stream for element entries on the given page.
 * If the input already matches a key, it is returned as-is.
 */
export async function resolveElementKey(
  editorClient: EditorClient,
  pagePathId: string,
  elementId: string,
): Promise<{ key: string; id: string } | null> {
  const changes = await editorClient.getChanges(0);

  for (const change of changes) {
    // Match element entries: ['%p3', pathId, '%el', elementKey] at depth 4
    if (
      change.path[0] === '%p3' &&
      change.path[1] === pagePathId &&
      change.path[2] === '%el' &&
      change.path.length === 4 &&
      change.data &&
      typeof change.data === 'object'
    ) {
      const key = change.path[3];
      const obj = change.data as Record<string, unknown>;
      const id = obj['id'] as string | undefined;

      // Match by ID
      if (id === elementId) return { key, id };
      // Match by key (user passed the key directly)
      if (key === elementId) return { key, id: id || key };
    }
  }

  return null;
}
