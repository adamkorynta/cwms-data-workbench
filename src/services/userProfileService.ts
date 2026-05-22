import { normalizeBaseUrl } from "../config/dataSources";
import { cdaFetch } from "../api/cdaClient";

export interface CdaUserProfile {
  username: string;
  email?: string;
  principal?: string;
  cacAuth?: boolean;
}

export async function fetchUserProfile(baseUrl: string, signal?: AbortSignal): Promise<CdaUserProfile> {
  const response = await cdaFetch(`${normalizeBaseUrl(baseUrl)}user/profile`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to resolve authenticated user (${response.status} ${response.statusText})`);
  }

  const payload = (await response.json()) as unknown;
  return parseUserProfile(payload);
}

export function parseUserProfile(payload: unknown): CdaUserProfile {
  if (!payload || typeof payload !== "object") {
    throw new Error("User profile response was empty.");
  }

  const record = payload as Record<string, unknown>;
  const username = firstString(record, ["user-name", "userName", "username", "name"]);
  if (!username) {
    throw new Error("User profile response did not include a username.");
  }

  return {
    username,
    email: firstString(record, ["email"]),
    principal: firstString(record, ["principal"]),
    cacAuth: firstBoolean(record, ["cac-auth", "cacAuth"]),
  };
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}