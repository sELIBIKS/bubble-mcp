import type { EditorClient } from './editor-client.js';

export interface MobilePageInfo {
  name: string;
  key: string;
  id: string;
  width: number;
  height: number;
  elementCount: number;
}

export interface MobileElementDef {
  key: string;
  type: string;
  displayName: string;
  id: string;
  pageKey: string;
  properties: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export class MobileDefinition {
  private pages = new Map<string, Record<string, unknown>>();
  private elements = new Map<string, MobileElementDef[]>();
  private pageNameToKey = new Map<string, string>();

  static async load(editorClient: EditorClient): Promise<MobileDefinition> {
    const def = new MobileDefinition();
    const derived = await editorClient.getDerived('ElementTypeToPath');

    const mobilePageKeys = new Set<string>();
    const mobileElementPaths: Array<{ pageKey: string; elKey: string; path: string[] }> = [];

    for (const [, pathMap] of Object.entries(derived)) {
      if (typeof pathMap !== 'object' || pathMap === null) continue;
      for (const dotPath of Object.keys(pathMap as Record<string, unknown>)) {
        if (!dotPath.startsWith('mobile_views.')) continue;
        const parts = dotPath.split('.');
        if (parts.length === 2) {
          mobilePageKeys.add(parts[1]);
        } else if (parts.length >= 4 && parts[2] === '%el') {
          mobilePageKeys.add(parts[1]);
          mobileElementPaths.push({ pageKey: parts[1], elKey: parts[3], path: parts });
        }
      }
    }

    if (mobilePageKeys.size === 0) return def;

    const pathArrays: string[][] = [];
    const pageKeysList = [...mobilePageKeys];
    for (const pageKey of pageKeysList) {
      pathArrays.push(['mobile_views', pageKey]);
    }
    for (const el of mobileElementPaths) {
      pathArrays.push(['mobile_views', el.pageKey, '%el', el.elKey]);
    }

    const result = await editorClient.loadPaths(pathArrays);

    for (let i = 0; i < pageKeysList.length; i++) {
      const pageData = result.data[i]?.data;
      if (!pageData || typeof pageData !== 'object') continue;
      const obj = pageData as Record<string, unknown>;
      const pageName = (obj['%nm'] as string) || pageKeysList[i];
      def.pages.set(pageKeysList[i], obj);
      def.pageNameToKey.set(pageName, pageKeysList[i]);
      def.elements.set(pageKeysList[i], []);
    }

    for (let i = 0; i < mobileElementPaths.length; i++) {
      const elData = result.data[pageKeysList.length + i]?.data;
      if (!elData || typeof elData !== 'object') continue;
      const obj = elData as Record<string, unknown>;
      const el = mobileElementPaths[i];
      const props = (obj['%p'] as Record<string, unknown>) || {};
      const element: MobileElementDef = {
        key: el.elKey,
        type: (obj['%x'] as string) || 'unknown',
        displayName: (obj['%dn'] as string) || el.elKey,
        id: (obj['id'] as string) || el.elKey,
        pageKey: el.pageKey,
        properties: props,
        raw: obj,
      };
      const pageElements = def.elements.get(el.pageKey);
      if (pageElements) pageElements.push(element);
    }

    return def;
  }

  hasMobilePages(): boolean { return this.pages.size > 0; }
  getPageNames(): string[] { return [...this.pageNameToKey.keys()]; }

  getPagePaths(): MobilePageInfo[] {
    const result: MobilePageInfo[] = [];
    for (const [key, data] of this.pages) {
      const props = (data['%p'] as Record<string, unknown>) || {};
      const name = (data['%nm'] as string) || key;
      result.push({
        name, key,
        id: (data['id'] as string) || key,
        width: (props['%w'] as number) || 0,
        height: (props['%h'] as number) || 0,
        elementCount: this.elements.get(key)?.length || 0,
      });
    }
    return result;
  }

  resolvePageKey(pageName: string): string | null { return this.pageNameToKey.get(pageName) ?? null; }
  getElements(pageKey: string): MobileElementDef[] { return this.elements.get(pageKey) ?? []; }

  getAllElements(): MobileElementDef[] {
    const all: MobileElementDef[] = [];
    for (const elements of this.elements.values()) all.push(...elements);
    return all;
  }

  getRawPages(): Map<string, Record<string, unknown>> { return new Map(this.pages); }
}
