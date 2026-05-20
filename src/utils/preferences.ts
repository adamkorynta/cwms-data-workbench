import { defaultDataSource, normalizeBaseUrl } from "../config/dataSources";
import type { TabId } from "../types";

const key = "cwms-workbench-preferences";

interface StoredPreferences {
  baseUrl?: string;
  office?: string;
  visibleColumns?: Partial<Record<TabId, string[]>>;
}

export function loadPreferences(): Required<StoredPreferences> {
  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(key) ?? "{}") as StoredPreferences;
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl ?? defaultDataSource.baseUrl),
      office: parsed.office ?? "SWT",
      visibleColumns: parsed.visibleColumns ?? {},
    };
  } catch {
    return {
      baseUrl: defaultDataSource.baseUrl,
      office: "SWT",
      visibleColumns: {},
    };
  }
}

export function savePreferences(preferences: StoredPreferences) {
  const current = loadPreferences();
  globalThis.localStorage.setItem(
    key,
    JSON.stringify({
      ...current,
      ...preferences,
      baseUrl: preferences.baseUrl ? normalizeBaseUrl(preferences.baseUrl) : current.baseUrl,
      visibleColumns: preferences.visibleColumns ?? current.visibleColumns,
    }),
  );
}

function unique(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function loadVisibleColumns(tabId: TabId, defaultColumns: string[], requiredColumns: string[] = []) {
  const preferences = loadPreferences();
  const savedColumns = preferences.visibleColumns[tabId] ?? [];
  const fallbackColumns = unique([...requiredColumns, ...defaultColumns]);
  const savedSelection = unique(savedColumns);

  if (savedSelection.length === 0) {
    return fallbackColumns;
  }

  return savedSelection;
}

export function saveVisibleColumns(tabId: TabId, visibleColumns: string[]) {
  const preferences = loadPreferences();
  savePreferences({
    visibleColumns: {
      ...preferences.visibleColumns,
      [tabId]: visibleColumns,
    },
  });
}
