import { createCwmsApi, getCdaConfig } from "../api/cdaClient";
import type { AliasMap, InventoryPageInfo, InventoryRow } from "../types";

interface LocationMetadata {
  location: string;
  office?: string;
  baseLocation?: string;
  subLocation?: string;
  publicName?: string;
  longName?: string;
  description?: string;
  locationKind?: string;
  locationType?: string;
  timezone?: string;
  nation?: string;
  state?: string;
  county?: string;
  nearestCity?: string;
  horizontalDatum?: string;
  publishedLongitude?: number;
  publishedLatitude?: number;
  elevation?: number;
  elevationUnits?: string;
  latitude?: number;
  longitude?: number;
  verticalDatum?: string;
  mapLabel?: string;
  boundingOffice?: string;
  active?: boolean;
  hasChildren?: boolean;
  aliases?: AliasMap;
}

interface LocationMetadataCatalogResult {
  rows: LocationMetadata[];
  pageInfo: InventoryPageInfo;
}

const LOCATION_PAGE_SIZE = 500;

let cachedCatalogKey: string | null = null;
let cachedCatalogPromise: Promise<LocationMetadataCatalogResult> | null = null;

export async function fetchLocationMetadataCatalog(): Promise<LocationMetadataCatalogResult> {
  const { baseUrl, office } = getCdaConfig();
  const cacheKey = `${baseUrl}|${office}`;
  if (cachedCatalogKey === cacheKey && cachedCatalogPromise) return cachedCatalogPromise;

  cachedCatalogKey = cacheKey;
  cachedCatalogPromise = fetchLocationMetadataCatalogUncached();
  return cachedCatalogPromise;
}

export async function fetchLocationMetadataById() {
  const catalog = await fetchLocationMetadataCatalog();
  return new Map(catalog.rows.map((row) => [row.location, row]));
}

export function applyLocationMetadataToLocationRow(row: InventoryRow, metadata: LocationMetadata): InventoryRow {
  const locationId = metadata.location || String(row.location ?? row.id);
  const parsedLocationParts = parseLocationIdParts(locationId);

  return {
    ...row,
    office: metadata.office ?? row.office,
    location: locationId,
    baseLocation: metadata.baseLocation ?? row.baseLocation ?? parsedLocationParts.baseLocation,
    subLocation: metadata.subLocation ?? row.subLocation ?? parsedLocationParts.subLocation,
    publicName: metadata.publicName ?? row.publicName,
    longName: metadata.longName ?? row.longName,
    description: metadata.description ?? row.description,
    locationKind: metadata.locationKind ?? row.locationKind,
    locationType: metadata.locationType ?? row.locationType,
    timezone: metadata.timezone ?? row.timezone,
    nation: metadata.nation ?? row.nation,
    state: metadata.state ?? row.state,
    county: metadata.county ?? row.county,
    nearestCity: metadata.nearestCity ?? row.nearestCity,
    horizontalDatum: metadata.horizontalDatum ?? row.horizontalDatum,
    longitude: metadata.longitude ?? metadata.publishedLongitude ?? row.longitude,
    latitude: metadata.latitude ?? metadata.publishedLatitude ?? row.latitude,
    publishedLongitude: metadata.publishedLongitude ?? metadata.longitude ?? row.publishedLongitude,
    publishedLatitude: metadata.publishedLatitude ?? metadata.latitude ?? row.publishedLatitude,
    elevation: metadata.elevation ?? row.elevation,
    unit: metadata.elevationUnits ?? row.unit,
    verticalDatum: metadata.verticalDatum ?? row.verticalDatum,
    mapLabel: metadata.mapLabel ?? row.mapLabel,
    boundingOffice: metadata.boundingOffice ?? row.boundingOffice,
    active: metadata.active ?? row.active,
    hasChildren: metadata.hasChildren ?? row.hasChildren,
    aliases: {
      ...(metadata.aliases ?? {}),
      ...(row.aliases as AliasMap | undefined),
    },
  };
}

export function enrichTimeSeriesRowWithLocationMetadata(row: InventoryRow, metadata?: LocationMetadata): InventoryRow {
  if (!metadata) return row;

  return {
    ...row,
    office: row.office ?? metadata.office,
    longName: metadata.longName ?? metadata.publicName ?? row.longName,
    publicName: metadata.publicName ?? metadata.longName ?? row.publicName,
    timezone: coalesceText(row.timezone, metadata.timezone),
    locationKind: metadata.locationKind ?? row.locationKind,
    latitude: metadata.latitude ?? metadata.publishedLatitude ?? row.latitude,
    longitude: metadata.longitude ?? row.longitude,
    aliases: {
      ...(metadata.aliases ?? {}),
      ...(row.aliases as AliasMap | undefined),
    },
  };
}

async function fetchLocationMetadataCatalogUncached(): Promise<LocationMetadataCatalogResult> {
  const api = await createCwmsApi<{
    getLocationsRaw: (request?: {
      names?: string;
      office?: string;
      unit?: string;
      datum?: string;
    }) => Promise<{ raw: Response }>;
  }>("LocationsApi");

  if (!api) {
    throw new Error("CWMS locations API client is unavailable.");
  }

  const { office } = getCdaConfig();
  const rawResponse = await api.getLocationsRaw({ office });
  const entries = await parsePossiblyMalformedJsonArray(rawResponse.raw);
  const deduped = dedupeAndSort(
    entries
      .map(toLocationMetadata)
      .filter((row): row is LocationMetadata => Boolean(row?.location)),
  );

  return {
    rows: deduped,
    pageInfo: {
      pagesLoaded: 1,
      totalRows: deduped.length,
      pageSize: LOCATION_PAGE_SIZE,
      exhausted: true,
      partial: false,
    },
  };
}

function dedupeAndSort(rows: LocationMetadata[]) {
  const map = new Map<string, LocationMetadata>();
  for (const row of rows) {
    const current = map.get(row.location);
    map.set(row.location, current ? mergeLocationMetadata(current, row) : row);
  }
  return Array.from(map.values()).sort((a, b) => a.location.localeCompare(b.location));
}

function mergeLocationMetadata(current: LocationMetadata, incoming: LocationMetadata): LocationMetadata {
  return {
    location: incoming.location || current.location,
    office: coalesceText(incoming.office, current.office),
    baseLocation: coalesceText(incoming.baseLocation, current.baseLocation),
    subLocation: coalesceText(incoming.subLocation, current.subLocation),
    publicName: coalesceText(incoming.publicName, current.publicName),
    longName: coalesceText(incoming.longName, current.longName),
    description: coalesceText(incoming.description, current.description),
    locationKind: coalesceText(incoming.locationKind, current.locationKind),
    locationType: coalesceText(incoming.locationType, current.locationType),
    timezone: coalesceText(incoming.timezone, current.timezone),
    nation: coalesceText(incoming.nation, current.nation),
    state: coalesceText(incoming.state, current.state),
    county: coalesceText(incoming.county, current.county),
    nearestCity: coalesceText(incoming.nearestCity, current.nearestCity),
    horizontalDatum: coalesceText(incoming.horizontalDatum, current.horizontalDatum),
    publishedLongitude: incoming.publishedLongitude ?? current.publishedLongitude,
    publishedLatitude: incoming.publishedLatitude ?? current.publishedLatitude,
    elevation: incoming.elevation ?? current.elevation,
    elevationUnits: coalesceText(incoming.elevationUnits, current.elevationUnits),
    latitude: incoming.latitude ?? current.latitude,
    longitude: incoming.longitude ?? current.longitude,
    verticalDatum: coalesceText(incoming.verticalDatum, current.verticalDatum),
    mapLabel: coalesceText(incoming.mapLabel, current.mapLabel),
    boundingOffice: coalesceText(incoming.boundingOffice, current.boundingOffice),
    active: incoming.active ?? current.active,
    aliases: {
      ...(current.aliases ?? {}),
      ...(incoming.aliases ?? {}),
    },
  };
}

function toLocationMetadata(value: unknown): LocationMetadata | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const location = firstString(record, [
    "location",
    "location-id",
    "locationId",
    "name",
    "id",
    "base-location-id",
    "baseLocation",
  ]);
  if (!location) return null;

  const latitude = firstNumber(record, ["latitude", "published-latitude", "publishedLatitude"]);
  const publishedLatitude = firstNumber(record, ["published-latitude", "publishedLatitude", "latitude"]);

  return {
    location,
    office: firstString(record, ["office", "office-id", "officeId", "office_id"]),
    baseLocation: firstString(record, ["base-location-id", "baseLocation", "base_location"]),
    subLocation: firstString(record, ["sub-location-id", "subLocation", "sub_location"]),
    publicName: firstString(record, ["public-name", "publicName", "public_name"]),
    longName: firstString(record, ["long-name", "longName", "long_name"]),
    description: firstString(record, ["description"]),
    locationKind: firstString(record, ["location-kind", "locationKind", "location-type", "locationType"]),
    locationType: firstString(record, ["location-type", "locationType"]),
    timezone: firstString(record, ["timezone", "time-zone", "timezone-name", "time_zone", "timezoneName"]),
    nation: firstString(record, ["nation"]),
    state: firstString(record, ["state", "stateInitial", "state-initial"]),
    county: firstString(record, ["county", "countyName", "county-name"]),
    nearestCity: firstString(record, ["nearestCity", "nearest-city"]),
    horizontalDatum: firstString(record, ["horizontalDatum", "horizontal-datum"]),
    publishedLongitude: firstNumber(record, ["published-longitude", "publishedLongitude", "longitude"]),
    publishedLatitude,
    elevation: firstNumber(record, ["elevation"]),
    elevationUnits: firstString(record, ["elevationUnits", "elevation-units"]),
    latitude,
    longitude: firstNumber(record, ["longitude", "published-longitude", "publishedLongitude"]),
    verticalDatum: firstString(record, ["vertical-datum", "verticalDatum"]),
    mapLabel: firstString(record, ["mapLabel", "map-label"]),
    boundingOffice: firstString(record, ["boundingOfficeId", "bounding-office-id", "boundingOffice"]),
    active: firstBoolean(record, ["active"]),
    aliases: extractAliases(record),
  };
}

function extractAliases(record: Record<string, unknown>): AliasMap {
  const aliases: AliasMap = {};
  const source = record.aliases;

  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") aliases[key] = value;
    }
  }

  if (Array.isArray(source)) {
    source.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const aliasRecord = item as Record<string, unknown>;
      const aliasName =
        firstString(aliasRecord, ["name", "group", "group-id", "alias", "key"]) ?? `Alias ${index + 1}`;
      const aliasValue =
        firstString(aliasRecord, ["value", "alias", "attribute", "value-text"]) ??
        firstNumber(aliasRecord, ["value", "attribute"]);
      if (aliasValue !== undefined) aliases[aliasName] = aliasValue;
    });
  }

  return aliases;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function coalesceText(primary: unknown, fallback: string | undefined) {
  if (typeof primary === "string" && primary.trim()) return primary;
  return fallback;
}

function parseLocationIdParts(locationId: string) {
  const [baseLocation, ...subParts] = locationId.split("-");
  return {
    baseLocation,
    subLocation: subParts.join("-"),
  };
}

async function parsePossiblyMalformedJsonArray(response: Response): Promise<unknown[]> {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Some CDA payloads can include unescaped control characters inside string values.
    const sanitized = text.replace(/[\u0000-\u001F]/g, "");
    const parsed = JSON.parse(sanitized) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  }
}

function firstBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return undefined;
}