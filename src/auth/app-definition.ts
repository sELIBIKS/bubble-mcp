import type { EditorChange } from './editor-client.js';

export interface DeepFieldDef {
  key: string;
  name: string;
  fieldType: string;
  isList: boolean;
  raw: unknown;
}

export interface DataTypeDef {
  key: string;
  name: string;
  privacyRoles: Record<string, unknown>;
  fields: Record<string, unknown>;
  deepFields?: DeepFieldDef[];
}

export interface PagePathInfo {
  name: string;
  id: string;
  path: string | null;
}

export interface OptionSetDef {
  key: string;
  name: string;
  options: unknown[];
  raw: unknown;
}

export interface AppSummary {
  dataTypeCount: number;
  optionSetCount: number;
  pageCount: number;
  dataTypeNames: string[];
  optionSetNames: string[];
  pageNames: string[];
}

export class AppDefinition {
  private userTypes = new Map<string, unknown>();
  private optionSets = new Map<string, unknown>();
  private pages = new Map<string, string>();
  private pagePaths = new Map<string, string>();
  private deepFieldStore = new Map<string, Map<string, unknown>>();
  private settingsMap = new Map<string, unknown>();

  static fromChanges(changes: EditorChange[]): AppDefinition {
    const def = new AppDefinition();

    for (const change of changes) {
      const [root, sub, marker, fieldKey] = change.path;

      if (root === 'user_types' && sub && change.path.length === 2) {
        def.userTypes.set(sub, change.data);
      }

      // Deep field: user_types/<typeKey>/%f3/<fieldKey>
      if (root === 'user_types' && sub && marker === '%f3' && fieldKey && change.path.length === 4) {
        if (!def.deepFieldStore.has(sub)) {
          def.deepFieldStore.set(sub, new Map());
        }
        def.deepFieldStore.get(sub)!.set(fieldKey, change.data);
      }

      if (root === 'option_sets' && sub && change.path.length === 2) {
        def.optionSets.set(sub, change.data);
      }

      if (root === '_index' && sub === 'page_name_to_id' && change.path.length === 2) {
        const pageMap = change.data as Record<string, string>;
        for (const [name, id] of Object.entries(pageMap)) {
          def.pages.set(name, id);
        }
      }

      if (root === '_index' && sub === 'page_name_to_path' && change.path.length === 2) {
        const pathMap = change.data as Record<string, string>;
        for (const [name, path] of Object.entries(pathMap)) {
          def.pagePaths.set(name, path);
        }
      }

      if (root === 'settings' && sub && change.path.length === 2) {
        def.settingsMap.set(sub, change.data);
      }
    }

    return def;
  }

  getDataTypes(): DataTypeDef[] {
    const result: DataTypeDef[] = [];
    for (const [key, raw] of this.userTypes) {
      const obj = raw as Record<string, unknown>;
      const deepFieldMap = this.deepFieldStore.get(key);
      const deepFields: DeepFieldDef[] | undefined = deepFieldMap
        ? [...deepFieldMap.entries()].map(([fKey, fRaw]) => {
            const fObj = fRaw as Record<string, unknown>;
            return {
              key: fKey,
              name: (fObj['%d'] as string) || fKey,
              fieldType: (fObj['%t'] as string) || 'unknown',
              isList: (fObj['%o'] as boolean) || false,
              raw: fRaw,
            };
          })
        : undefined;

      result.push({
        key,
        name: (obj['%d'] as string) || key,
        privacyRoles: (obj['privacy_role'] as Record<string, unknown>) || {},
        fields: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'privacy_role'),
        ),
        deepFields,
      });
    }
    return result;
  }

  getOptionSets(): OptionSetDef[] {
    const result: OptionSetDef[] = [];
    for (const [key, raw] of this.optionSets) {
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        options: (obj['options'] as unknown[]) || [],
        raw,
      });
    }
    return result;
  }

  getPageNames(): string[] {
    return [...this.pages.keys()];
  }

  getPagePaths(): PagePathInfo[] {
    const result: PagePathInfo[] = [];
    for (const [name, id] of this.pages) {
      result.push({
        name,
        id,
        path: this.pagePaths.get(name) ?? null,
      });
    }
    return result;
  }

  resolvePagePath(pageName: string): string | null {
    return this.pagePaths.get(pageName) ?? null;
  }

  resolvePageId(pageName: string): string | null {
    return this.pages.get(pageName) ?? null;
  }

  getSettings(): Record<string, unknown> {
    return Object.fromEntries(this.settingsMap);
  }

  getSummary(): AppSummary {
    const types = this.getDataTypes();
    const sets = this.getOptionSets();
    const pages = this.getPageNames();
    return {
      dataTypeCount: types.length,
      optionSetCount: sets.length,
      pageCount: pages.length,
      dataTypeNames: types.map((t) => t.name),
      optionSetNames: sets.map((s) => s.name),
      pageNames: pages,
    };
  }
}
