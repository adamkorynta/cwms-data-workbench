import type { InventoryDataset, InventoryRow, PlotPoint, TimeWindow } from "../types";
import {
  levelsDataset,
  locationsDataset,
  measurementsDataset,
  timeSeriesDataset,
} from "../data/mockData";
import { createCwmsApi, getCdaConfig } from "../api/cdaClient";
import { mapTimeSeriesCatalogEntry, type TimeSeriesCatalogEntryLike } from "./timeSeriesCatalogMapper";
import {
  applyLocationMetadataToLocationRow,
  enrichTimeSeriesRowWithLocationMetadata,
  fetchLocationMetadataById,
  fetchLocationMetadataCatalog,
} from "./locationMetadataService";
import { fetchLocationGroupsInventory as fetchLocationGroupsInventoryFromService } from "./locationGroupsService";
import { fetchRatingsInventory as fetchRatingsInventoryFromService } from "./ratingsService";
import { fetchTimeSeriesGroupsInventory as fetchTimeSeriesGroupsInventoryFromService } from "./timeSeriesGroupsService";

const delay = (ms = 120) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface PageResult<TRow> {
  rows: TRow[];
  nextPageToken?: string;
  total?: number;
}

interface FetchAllPagesOptions {
  pageSize?: number;
  maxPages?: number;
  allowPartial?: boolean;
}

export async function fetchAllPages<TRow>(
  fetchPage: (pageToken: string | undefined, pageSize: number) => Promise<PageResult<TRow>>,
  options: FetchAllPagesOptions = {},
) {
  const pageSize = options.pageSize ?? 500;
  const maxPages = options.maxPages ?? 1000;
  const allowPartial = options.allowPartial ?? false;
  const rows: TRow[] = [];
  let pageToken: string | undefined;
  let pagesLoaded = 0;
  let total: number | undefined;
  let warning: string | undefined;
  let errorPage: number | undefined;

  do {
    let page: PageResult<TRow>;
    try {
      page = await fetchPage(pageToken, pageSize);
    } catch (caught) {
      if (!allowPartial || rows.length === 0) throw caught;
      errorPage = pagesLoaded + 1;
      warning = caught instanceof Error ? caught.message : "A later page failed to load.";
      pageToken = undefined;
      break;
    }
    rows.push(...page.rows);
    pageToken = page.nextPageToken;
    total = page.total ?? total;
    pagesLoaded += 1;
  } while (pageToken && pagesLoaded < maxPages);

  return {
    rows,
    pageInfo: {
      pagesLoaded,
      totalRows: total ?? rows.length,
      pageSize,
      exhausted: !pageToken,
      partial: Boolean(warning),
      errorPage,
      warning,
    },
  };
}

function createMockPageFetcher(rows: InventoryRow[]) {
  return async (pageToken: string | undefined, pageSize: number): Promise<PageResult<InventoryRow>> => {
    await delay();
    const start = pageToken ? Number(pageToken) : 0;
    const end = Math.min(start + pageSize, rows.length);
    return {
      rows: rows.slice(start, end),
      nextPageToken: end < rows.length ? String(end) : undefined,
      total: rows.length,
    };
  };
}

async function withPaginatedMockFallback(dataset: InventoryDataset, pageSize = 16): Promise<InventoryDataset> {
  const paged = await fetchAllPages(createMockPageFetcher(dataset.rows), { pageSize });
  return {
    ...dataset,
    rows: paged.rows,
    pageInfo: paged.pageInfo,
  };
}

export async function fetchTimeSeriesInventory(): Promise<InventoryDataset> {
  const api = await createCwmsApi<{
    getCatalogWithDataset: (request: {
      dataset: "TIMESERIES";
      page?: string;
      pageSize?: number;
      unitSystem?: "EN" | "SI";
      office?: string;
      includeExtents?: boolean;
      includeAliases?: boolean;
    }) => Promise<{
      entries?: unknown[];
      nextPage?: string;
      total?: number;
    }>;
  }>("CatalogApi");

  if (!api) {
    throw new Error("CWMS catalog API client is unavailable.");
  }

  const { office } = getCdaConfig();
  const [locationMetadataById, paged] = await Promise.all([
    fetchLocationMetadataById(),
    fetchAllPages(
      async (page, pageSize) => {
        const response = await api.getCatalogWithDataset({
          dataset: "TIMESERIES",
          office,
          page,
          pageSize,
          unitSystem: "EN",
          includeExtents: true,
          includeAliases: false,
        });

        const entries = (response.entries ?? []) as TimeSeriesCatalogEntryLike[];
        return {
          rows: entries.map((entry, index) => mapTimeSeriesCatalogEntry(entry, index)),
          nextPageToken: response.nextPage,
          total: response.total,
        };
      },
      { pageSize: 500, maxPages: 1000, allowPartial: true },
    ),
  ]);

  return {
    ...timeSeriesDataset,
    rows: paged.rows.map((row, index) => {
      const metadata = locationMetadataById.get(String(row.location ?? ""));
      return enrichTimeSeriesRowWithLocationMetadata({ ...row, number: index + 1 }, metadata);
    }),
    pageInfo: paged.pageInfo,
  };
}

export async function fetchRatingsInventory(): Promise<InventoryDataset> {
  return fetchRatingsInventoryFromService();
}

export async function fetchLevelsInventory(): Promise<InventoryDataset> {
  // TODO: Wire to location-level and specified-level CDA endpoints, following each page token.
  return withPaginatedMockFallback(levelsDataset);
}

export async function fetchLocationGroupsInventory(): Promise<InventoryDataset> {
  return fetchLocationGroupsInventoryFromService();
}

export async function fetchTimeSeriesGroupsInventory(): Promise<InventoryDataset> {
  return fetchTimeSeriesGroupsInventoryFromService();
}

export async function fetchLocationsInventory(): Promise<InventoryDataset> {
  const metadataCatalog = await fetchLocationMetadataCatalog();
  return {
    ...locationsDataset,
    rows: metadataCatalog.rows.map((metadata) =>
      applyLocationMetadataToLocationRow(
        {
          id: metadata.location,
          kind: "location",
          label: metadata.location,
          location: metadata.location,
          office: metadata.office,
        },
        metadata,
      ),
    ),
    pageInfo: metadataCatalog.pageInfo,
  };
}

export async function fetchMeasurementsInventory(): Promise<InventoryDataset> {
  // TODO: Wire to Measurements endpoints and related current stage/flow time series lookups, following each page token.
  return withPaginatedMockFallback(measurementsDataset);
}

interface TimeSeriesRange {
  begin?: string;
  end?: string;
}

export interface PlotSeriesPoint {
  date: string;
  value: number | null;
  quality: string | number | null;
}

export interface PlotSeriesData {
  seriesName: string;
  points: PlotSeriesPoint[];
}

function toIsoDateTime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const normalized = time.trim();
  if (normalized === "24:00" || normalized === "24:00:00") {
    const [year, month, day] = date.split("-").map(Number);
    if ([year, month, day].some((v) => Number.isNaN(v))) return undefined;
    const midnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    return midnight.toISOString();
  }

  const candidate = new Date(`${date}T${normalized}`);
  if (Number.isNaN(candidate.valueOf())) return undefined;
  return candidate.toISOString();
}

function addDuration(value: Date, amount: number, unit: TimeWindow["goBackUnit"]): Date {
  const next = new Date(value.getTime());
  switch (unit) {
    case "hours":
      next.setUTCHours(next.getUTCHours() + amount);
      break;
    case "days":
      next.setUTCDate(next.getUTCDate() + amount);
      break;
    case "months":
      next.setUTCMonth(next.getUTCMonth() + amount);
      break;
    case "years":
      next.setUTCFullYear(next.getUTCFullYear() + amount);
      break;
  }
  return next;
}

function resolveTimeWindowRange(timeWindow: TimeWindow): TimeSeriesRange {
  if (timeWindow.mode === "none") return {};

  if (timeWindow.mode === "specific") {
    return {
      begin: toIsoDateTime(timeWindow.startDate, timeWindow.startTime),
      end: toIsoDateTime(timeWindow.endDate, timeWindow.endTime),
    };
  }

  if (timeWindow.mode === "relative") {
    const now = new Date();
    return {
      begin: addDuration(now, -timeWindow.goBack, timeWindow.goBackUnit).toISOString(),
      end: addDuration(now, timeWindow.goForward, timeWindow.goForwardUnit).toISOString(),
    };
  }

  if (timeWindow.mode === "waterYear") {
    const [month, day] = timeWindow.waterYearStart.split("-").map(Number);
    if ([month, day].some((value) => Number.isNaN(value))) return {};
    const now = new Date();
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day, 0, 0, 0));
    const begin = now < candidate ? addDuration(candidate, -1, "years") : candidate;
    const end = addDuration(begin, 1, "years");
    return { begin: begin.toISOString(), end: end.toISOString() };
  }

  return {};
}

function rowValueToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateToMillis(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function fetchSeriesPoints(api: import("cwmsjs").TimeSeriesApi, seriesName: string, range: TimeSeriesRange) {
  const points: PlotSeriesPoint[] = [];
  let page: string | undefined;

  do {
    const response = await api.getTimeSeries({
      name: seriesName,
      office: getCdaConfig().office,
      begin: range.begin,
      end: range.end,
      page,
      pageSize: 500,
      trim: true,
    });

    const rows = response.values ?? [];
    for (const rawRow of rows) {
      const rowArray = Array.isArray(rawRow) ? rawRow : [rawRow];
      const [rawDate, rawValue, rawQuality] = rowArray;
      if (!rawDate) continue;
      const qualityText = rawQuality === null || rawQuality === undefined
        ? null
        : String(rawQuality).trim();
      points.push({
        date: String(rawDate),
        value: rowValueToNumber(rawValue),
        quality: qualityText ? qualityText : null,
      });
    }

    page = response.nextPage ?? undefined;
  } while (page);

  points.sort((a, b) => parseDateToMillis(a.date) - parseDateToMillis(b.date));

  return points;
}

function mergePlotPoints(
  seriesData: PlotSeriesData[],
): PlotPoint[] {
  const map = new Map<string, PlotPoint>();

  for (const series of seriesData) {
    for (const point of series.points) {
      const dateKey = point.date;
      const row = map.get(dateKey) ?? { date: dateKey };
      row[series.seriesName] = point.value ?? "";
      if (point.quality !== null) {
        row[`${series.seriesName}__quality`] = point.quality;
      }
      map.set(dateKey, row);
    }
  }

  return Array.from(map.values()).sort((a, b) => parseDateToMillis(a.date) - parseDateToMillis(b.date));
}

export async function fetchPlotData(seriesNames: string[], timeWindow: TimeWindow): Promise<PlotPoint[]> {
  const seriesData = await fetchPlotSeriesData(seriesNames, timeWindow);
  return mergePlotPoints(seriesData);
}

export async function fetchPlotSeriesData(seriesNames: string[], timeWindow: TimeWindow): Promise<PlotSeriesData[]> {
  const uniqueSeriesNames = Array.from(new Set(seriesNames.filter((seriesName) => seriesName.trim().length > 0)));
  if (!uniqueSeriesNames.length) return [];

  const api = await createCwmsApi<import("cwmsjs").TimeSeriesApi>("TimeSeriesApi");
  if (!api) {
    throw new Error("CWMS TimeSeries API client is unavailable.");
  }

  const range = resolveTimeWindowRange(timeWindow);
  const settledSeries = await Promise.allSettled(uniqueSeriesNames.map(async (seriesName) => ({
    seriesName,
    points: await fetchSeriesPoints(api, seriesName, range),
  })));

  const seriesData: PlotSeriesData[] = settledSeries.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  if (seriesData.length === 0) {
    const firstFailure = settledSeries.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw (firstFailure?.reason instanceof Error ? firstFailure.reason : new Error("Unable to load plot data."));
  }

  return seriesData;
}
