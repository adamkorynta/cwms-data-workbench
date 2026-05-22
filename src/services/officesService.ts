import { normalizeBaseUrl } from "../config/dataSources";
import { cdaFetch } from "../api/cdaClient";
import type { CdaOffice } from "../types";

export async function fetchOffices(baseUrl: string, signal?: AbortSignal): Promise<CdaOffice[]> {
  const response = await cdaFetch(`${normalizeBaseUrl(baseUrl)}offices`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to load offices (${response.status} ${response.statusText})`);
  }

  const payload = (await response.json()) as unknown;
  return parseOffices(payload);
}

export function parseOffices(payload: unknown): CdaOffice[] {
  const candidates = findOfficeArray(payload);
  const offices = candidates
    .map((item) => {
      if (typeof item === "string") return { id: item };
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const id = firstString(record, ["id", "office", "office-id", "officeId", "name", "code"]);
      if (!id) return null;

      return {
        id,
        name: firstString(record, ["long-name", "longName", "description"]),
      };
    })
    .filter((office): office is CdaOffice => Boolean(office));

  return Array.from(new Map(offices.map((office) => [office.id, office])).values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

function findOfficeArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["offices", "office", "items", "values"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}
