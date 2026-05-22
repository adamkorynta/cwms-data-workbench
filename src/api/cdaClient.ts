export interface CdaClientConfig {
  baseUrl: string;
  office: string;
  timezone: string;
  apiKey?: string;
  accessToken?: string;
}

const cdaAccessTokenStorageKey = "cwms-cda-access-token";

let config: CdaClientConfig = {
  baseUrl: "https://cwms-data.usace.army.mil/cwms-data",
  office: "SWT",
  timezone: "UTC",
};

export function configureCdaClient(next: Partial<CdaClientConfig>) {
  config = { ...config, ...next };
}

export function getCdaConfig() {
  return config;
}

export function setCdaAccessToken(token: string | undefined) {
  const normalized = normalizeToken(token);
  config = { ...config, accessToken: normalized };

  if (!canUseSessionStorage()) return;
  if (normalized) {
    globalThis.sessionStorage.setItem(cdaAccessTokenStorageKey, normalized);
  } else {
    globalThis.sessionStorage.removeItem(cdaAccessTokenStorageKey);
  }
}

export function setCdaApiKey(apiKey: string | undefined) {
  const normalized = normalizeApiKey(apiKey);
  config = { ...config, apiKey: normalized };
}

export function loadCdaAccessTokenFromSession() {
  if (!canUseSessionStorage()) return;
  const token = normalizeToken(globalThis.sessionStorage.getItem(cdaAccessTokenStorageKey) ?? undefined);
  if (token) config = { ...config, accessToken: token };
}

export function extractCdaAccessTokenFromUrl() {
  const currentUrl = new URL(globalThis.location.href);
  let token =
    normalizeToken(currentUrl.searchParams.get("access_token") ?? undefined) ??
    normalizeToken(currentUrl.searchParams.get("id_token") ?? undefined);

  if (!token && currentUrl.hash) {
    const fragment = new URLSearchParams(currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash);
    token = normalizeToken(fragment.get("access_token") ?? undefined) ?? normalizeToken(fragment.get("id_token") ?? undefined);
  }

  if (token) {
    setCdaAccessToken(token);
    scrubSensitiveAuthParamsFromUrl();
  }

  return token;
}

export async function cdaFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (config.accessToken && !headers.has("Authorization") && isCdaRequest(input)) {
    headers.set("Authorization", `Bearer ${config.accessToken}`);
  }
  if (config.apiKey && !headers.has("apikey") && isCdaRequest(input)) {
    headers.set("apikey", config.apiKey);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export async function createCwmsApi<TApi>(apiName: string): Promise<TApi | null> {
  try {
    const cwms = (await import("cwmsjs")) as unknown as {
      Configuration: new (...args: unknown[]) => unknown;
    } & Record<string, new (...args: unknown[]) => TApi>;
    const ApiCtor = cwms[apiName];
    if (!ApiCtor) return null;
    const configuration = new cwms.Configuration({
      basePath: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey,
      accessToken: config.accessToken,
    });
    return new ApiCtor(configuration);
  } catch {
    return null;
  }
}

export class CdaServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CdaServiceError";
  }
}

function normalizeToken(token: string | undefined) {
  if (!token) return undefined;
  const trimmed = token.trim();
  return trimmed || undefined;
}

function normalizeApiKey(apiKey: string | undefined) {
  if (!apiKey) return undefined;
  const trimmed = apiKey.trim();
  return trimmed || undefined;
}

function canUseSessionStorage() {
  return globalThis.sessionStorage !== undefined;
}

function isCdaRequest(requestUrl: string) {
  try {
    const target = new URL(requestUrl, globalThis.location.origin);
    const configured = new URL(config.baseUrl, globalThis.location.origin);
    return target.origin === configured.origin && target.pathname.startsWith(configured.pathname.replace(/\/$/, ""));
  } catch {
    return false;
  }
}

function scrubSensitiveAuthParamsFromUrl() {
  const url = new URL(globalThis.location.href);
  const queryKeys = ["access_token", "id_token", "token_type", "expires_in", "session_state", "code", "state"];
  for (const key of queryKeys) {
    url.searchParams.delete(key);
  }

  if (url.hash) {
    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    for (const key of queryKeys) {
      fragment.delete(key);
    }
    const nextHash = fragment.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  globalThis.history.replaceState({}, "", url.toString());
}
