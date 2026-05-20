import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadVisibleColumns, saveVisibleColumns } from "./preferences";

const storage = new Map<string, string>();

function installLocalStorageMock() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
}

beforeEach(() => {
  storage.clear();
  installLocalStorageMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("visible column preferences", () => {
  it("keeps saved columns even when they are not currently available", () => {
    saveVisibleColumns("time-series", ["timeSeriesId", "alias", "deprecatedColumn"]);

    expect(loadVisibleColumns("time-series", ["timeSeriesId", "alias"]))
      .toEqual(["timeSeriesId", "alias", "deprecatedColumn"]);
  });

  it("preserves a saved custom layout instead of re-adding defaults", () => {
    saveVisibleColumns("locations", ["publicName"]);

    expect(loadVisibleColumns("locations", ["location", "office"], ["location"]))
      .toEqual(["location", "publicName"]);
  });

  it("falls back to defaults when no saved selection exists", () => {
    expect(loadVisibleColumns("locations", ["location", "office"], ["location"]))
      .toEqual(["location", "office"]);
  });
});