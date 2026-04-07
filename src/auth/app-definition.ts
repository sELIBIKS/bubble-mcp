import type { EditorChange } from './editor-client.js';

export interface DataTypeDef {
  key: string;
  name: string;
  privacyRoles: Record<string, unknown>;
  fields: Record<string, unknown>;
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
  private settingsMap = new Map<string, unknown>();

  static fromChanges(changes: EditorChange[]): AppDefinition {
    const def = new AppDefinition();

    for (const change of changes) {
      const [root, sub] = change.path;

      if (root === 'user_types' && sub && change.path.length === 2) {
        def.userTypes.set(sub, change.data);
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
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        privacyRoles: (obj['privacy_role'] as Record<string, unknown>) || {},
        fields: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'privacy_role'),
        ),
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
