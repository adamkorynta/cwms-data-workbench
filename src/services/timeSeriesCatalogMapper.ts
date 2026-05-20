import type { AliasMap, InventoryRow } from "../types";

export interface TimeSeriesCatalogEntryLike {
  office?: string;
  name?: string;
  units?: string;
  interval?: string;
  intervalOffset?: number;
  timeZone?: string;
  extents?: Array<{
    earliestTime?: Date;
    latestTime?: Date;
    versionTime?: Date;
    lastUpdate?: Date;
  }>;
  aliases?: Array<{
    name?: string;
    value?: string;
  }>;
}

export function mapTimeSeriesCatalogEntry(entry: TimeSeriesCatalogEntryLike, index: number): InventoryRow {
  const timeSeriesId = entry.name ?? "";
  const parts = parseTimeSeriesId(timeSeriesId);
  const primaryExtent = entry.extents?.[0];

  return {
    id: `${entry.office ?? ""}:${timeSeriesId}`,
    kind: "timeSeries",
    label: timeSeriesId,
    number: index + 1,
    timeSeriesId,
    office: entry.office,
    location: parts.location,
    parameter: parts.parameter,
    type: parts.type,
    interval: entry.interval ?? parts.interval,
    duration: parts.duration,
    version: parts.version,
    intervalOffset: entry.intervalOffset ?? "",
    timezone: entry.timeZone,
    longName: parts.location,
    publicName: parts.location,
    dataEntryDate: formatDate(primaryExtent?.lastUpdate),
    first: formatDate(primaryExtent?.earliestTime),
    last: formatDate(primaryExtent?.latestTime),
    versionDate: formatDate(primaryExtent?.versionTime),
    units: entry.units,
    aliases: aliasesToMap(entry.aliases),
  };
}

export function parseTimeSeriesId(timeSeriesId: string) {
  const parts = timeSeriesId.split(".");
  return {
    location: parts[0] ?? "",
    parameter: parts[1] ?? "",
    type: parts[2] ?? "",
    interval: parts[3] ?? "",
    duration: parts[4] ?? "",
    version: parts.slice(5).join("."),
  };
}

function aliasesToMap(aliases: TimeSeriesCatalogEntryLike["aliases"]): AliasMap {
  return (aliases ?? []).reduce<AliasMap>((acc, alias, index) => {
    const key = alias.name && alias.name !== "null-null" ? alias.name : `Alias ${index + 1}`;
    acc[key] = alias.value;
    return acc;
  }, {});
}

function formatDate(value: Date | undefined) {
  if (!value) return "";
  return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}
