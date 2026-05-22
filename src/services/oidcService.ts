import { normalizeBaseUrl } from "../config/dataSources";
import { cdaFetch } from "../api/cdaClient";

interface OpenIdConnectSecuritySchemeLike {
  openIdConnectUrl?: unknown;
  "x-kc_idp_hint"?: unknown;
  "x-oidc-client-id"?: unknown;
}

interface OidcDiscoveryDocumentLike {
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
}

interface OidcStaticMapping {
  openIdConnectUrl: string;
  clientId: string;
  idpHintParam?: string;
  idpHintValue?: string;
}

export interface OidcBootstrapConfig {
  clientId: string;
  openIdConnectUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  idpHintParam?: string;
  idpHintValue?: string;
}

export interface OidcLoginCompletionResult {
  status: "success" | "error" | "none";
  accessToken?: string;
  error?: string;
  errorDescription?: string;
}

const oidcPkceStateStorageKey = "cwms-oidc-pkce-state";
const oidcPkceVerifierStorageKey = "cwms-oidc-pkce-verifier";

const oidcMappingsByHost: Record<string, OidcStaticMapping> = {
  "localhost:5173": {
    openIdConnectUrl: "https://identity-test.cwbi.mil/auth/realms/cwbi/.well-known/openid-configuration",
    clientId: "cwms",
    idpHintParam: "kc_idp_hint",
    idpHintValue: "federation-eams",
  },
  "cwms-data-test.cwbi.us": {
    openIdConnectUrl: "https://identity-test.cwbi.mil/auth/realms/cwbi/.well-known/openid-configuration",
    clientId: "cwms",
    idpHintParam: "kc_idp_hint",
    idpHintValue: "federation-eams",
  },
  "cwms-data.usace.army.mil": {
    openIdConnectUrl: "https://identityc.sec.usace.army.mil/auth/realms/cwbi/.well-known/openid-configuration",
    clientId: "cwms",
    idpHintParam: "kc_idp_hint",
    idpHintValue: "federation-eams",
  },
  "cwms.sec.usace.army.mil": {
    openIdConnectUrl: "https://identityc.sec.usace.army.mil/auth/realms/cwbi/.well-known/openid-configuration",
    clientId: "cwms",
    idpHintParam: "kc_idp_hint",
    idpHintValue: "federation-eams",
  },
};

export async function fetchOidcBootstrapConfig(baseUrl: string, signal?: AbortSignal): Promise<OidcBootstrapConfig> {
  try {
    const response = await cdaFetch(`${normalizeBaseUrl(baseUrl)}swagger-docs`, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Unable to load CDA OpenAPI schema (${response.status} ${response.statusText})`);
    }

    const openApi = (await response.json()) as unknown;
    return parseOidcBootstrapConfig(openApi, signal);
  } catch {
    const mapped = resolveMappedOidcConfig(baseUrl);
    if (mapped) return mapped;
    throw new Error("Unable to load OpenIDConnect metadata for this CDA host.");
  }
}

export async function parseOidcBootstrapConfig(payload: unknown, signal?: AbortSignal): Promise<OidcBootstrapConfig> {
  if (!payload || typeof payload !== "object") {
    throw new Error("CDA OpenAPI schema was empty.");
  }

  const root = payload as Record<string, unknown>;
  const components = asRecord(root.components);
  const securitySchemes = asRecord(components?.securitySchemes);
  const scheme = asRecord(securitySchemes?.OpenIDConnect) as OpenIdConnectSecuritySchemeLike | null;

  if (!scheme) {
    throw new Error("OpenIDConnect security scheme was not found in CDA OpenAPI schema.");
  }

  const openIdConnectUrl = asNonEmptyString(scheme.openIdConnectUrl);
  if (!openIdConnectUrl) {
    throw new Error("OpenIDConnect discovery URL was missing from CDA OpenAPI schema.");
  }

  const clientId = asNonEmptyString(scheme["x-oidc-client-id"]);
  if (!clientId) {
    throw new Error("OIDC client id was missing from CDA OpenAPI schema.");
  }

  const idpHintConfig = asRecord(scheme["x-kc_idp_hint"]);
  const idpHintParam = asNonEmptyString(idpHintConfig?.["query-parameter"]);
  const idpHintValue = firstStringFromArray(idpHintConfig?.values);

  let authorizationEndpoint = deriveAuthorizationEndpoint(openIdConnectUrl);
  let tokenEndpoint = deriveTokenEndpoint(openIdConnectUrl);
  try {
    const discoveryResponse = await fetch(openIdConnectUrl, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (discoveryResponse.ok) {
      const discovery = (await discoveryResponse.json()) as OidcDiscoveryDocumentLike;
      const discoveredEndpoint = asNonEmptyString(discovery.authorization_endpoint);
      if (discoveredEndpoint) authorizationEndpoint = discoveredEndpoint;
      const discoveredTokenEndpoint = asNonEmptyString(discovery.token_endpoint);
      if (discoveredTokenEndpoint) tokenEndpoint = discoveredTokenEndpoint;
    }
  } catch {
    // Fall back to deriving the authorization endpoint from the discovery URL.
  }

  return {
    clientId,
    openIdConnectUrl,
    authorizationEndpoint,
    tokenEndpoint,
    idpHintParam,
    idpHintValue,
  };
}

export async function beginOidcLogin(config: OidcBootstrapConfig, redirectUri: string): Promise<string> {
  const state = createRandomUrlSafeString(16);
  const codeVerifier = createRandomUrlSafeString(32);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  if (canUseSessionStorage()) {
    globalThis.sessionStorage.setItem(oidcPkceStateStorageKey, state);
    globalThis.sessionStorage.setItem(oidcPkceVerifierStorageKey, codeVerifier);
  }

  return buildOpenIdConnectAuthorizeUrl(config, redirectUri, state, codeChallenge);
}

export async function completeOidcLoginFromUrl(baseUrl: string, signal?: AbortSignal): Promise<OidcLoginCompletionResult | null> {
  const currentUrl = new URL(globalThis.location.href);
  const error = asNonEmptyString(currentUrl.searchParams.get("error"));
  const errorDescription = asNonEmptyString(currentUrl.searchParams.get("error_description"));

  if (!error && !currentUrl.searchParams.get("code")) {
    return null;
  }

  if (error) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    return { status: "error", error, errorDescription };
  }

  const code = asNonEmptyString(currentUrl.searchParams.get("code"));
  const state = asNonEmptyString(currentUrl.searchParams.get("state"));
  const storedState = canUseSessionStorage() ? globalThis.sessionStorage.getItem(oidcPkceStateStorageKey) ?? undefined : undefined;
  const codeVerifier = canUseSessionStorage() ? globalThis.sessionStorage.getItem(oidcPkceVerifierStorageKey) ?? undefined : undefined;

  if (!code) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    return { status: "error", error: "missing_code", errorDescription: "OIDC callback did not include an authorization code." };
  }

  if (!state || !storedState || state !== storedState) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    return { status: "error", error: "invalid_state", errorDescription: "OIDC state validation failed." };
  }

  if (!codeVerifier) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    return { status: "error", error: "missing_verifier", errorDescription: "OIDC code verifier was missing." };
  }

  const oidc = await fetchOidcBootstrapConfig(baseUrl, signal);
  const tokenResponse = await fetch(oidc.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: oidc.clientId,
      code,
      redirect_uri: globalThis.location.origin + globalThis.location.pathname + globalThis.location.search,
      code_verifier: codeVerifier,
    }).toString(),
    signal,
  });

  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    const tokenError = asNonEmptyString(asRecord(tokenPayload)?.error) ?? `token_endpoint_${tokenResponse.status}`;
    const tokenErrorDescription = asNonEmptyString(asRecord(tokenPayload)?.error_description) ?? `Unable to exchange authorization code (${tokenResponse.status} ${tokenResponse.statusText}).`;
    return { status: "error", error: tokenError, errorDescription: tokenErrorDescription };
  }

  const accessToken = asNonEmptyString(asRecord(tokenPayload)?.access_token);
  if (!accessToken) {
    scrubOidcCallbackParamsFromUrl();
    clearPkceStorage();
    return { status: "error", error: "missing_access_token", errorDescription: "Token endpoint response did not include an access token." };
  }

  scrubOidcCallbackParamsFromUrl();
  clearPkceStorage();
  return { status: "success", accessToken };
}

export function buildOpenIdConnectAuthorizeUrl(config: OidcBootstrapConfig, redirectUri: string, state: string, codeChallenge: string): string {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (config.idpHintParam && config.idpHintValue) {
    url.searchParams.set(config.idpHintParam, config.idpHintValue);
  }

  return url.toString();
}

function deriveAuthorizationEndpoint(openIdConnectUrl: string): string {
  const url = new URL(openIdConnectUrl);
  url.pathname = url.pathname.replace(/\/\.well-known\/openid-configuration$/, "/protocol/openid-connect/auth");
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstStringFromArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    const text = asNonEmptyString(entry);
    if (text) return text;
  }
  return undefined;
}

function resolveMappedOidcConfig(baseUrl: string): OidcBootstrapConfig | null {
  const host = new URL(baseUrl).host.toLowerCase();
  const mapping = oidcMappingsByHost[host];
  if (!mapping) return null;

  return {
    clientId: mapping.clientId,
    openIdConnectUrl: mapping.openIdConnectUrl,
    authorizationEndpoint: deriveAuthorizationEndpoint(mapping.openIdConnectUrl),
    tokenEndpoint: deriveTokenEndpoint(mapping.openIdConnectUrl),
    idpHintParam: mapping.idpHintParam,
    idpHintValue: mapping.idpHintValue,
  };
}

function deriveTokenEndpoint(openIdConnectUrl: string): string {
  const url = new URL(openIdConnectUrl);
  url.pathname = url.pathname.replace(/\/\.well-known\/openid-configuration$/, "/protocol/openid-connect/token");
  return url.toString();
}

function canUseSessionStorage() {
  return globalThis.sessionStorage !== undefined;
}

function clearPkceStorage() {
  if (!canUseSessionStorage()) return;
  globalThis.sessionStorage.removeItem(oidcPkceStateStorageKey);
  globalThis.sessionStorage.removeItem(oidcPkceVerifierStorageKey);
}

function scrubOidcCallbackParamsFromUrl() {
  const url = new URL(globalThis.location.href);
  for (const key of ["code", "state", "session_state", "error", "error_description"]) {
    url.searchParams.delete(key);
  }
  globalThis.history.replaceState({}, "", url.toString());
}

async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function createRandomUrlSafeString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return globalThis.btoa(binary).split("+").join("-").split("/").join("_").replace(/=+$/g, "");
}