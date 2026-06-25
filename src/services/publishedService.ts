import { createCwmsApi, getCdaConfig } from "../api/cdaClient";
import type { InventoryDataset, InventoryRow } from "../types";
import { mapTimeSeriesCatalogEntry, parseTimeSeriesId, type TimeSeriesCatalogEntryLike } from "./timeSeriesCatalogMapper";
import { fetchLocationMetadataCatalog } from "./locationMetadataService";

export interface PublishedLocation extends InventoryRow {
  locationId: string;
}

export interface PublishedTimeSeriesAssignment extends InventoryRow {
  timeSeriesId: string;
  parameter: string;
}

export async function fetchPublishedLocations(): Promise<InventoryDataset> {
  const metadataCatalog = await fetchLocationMetadataCatalog();
  
  // To determine which locations have time series, we need to check the TS catalog.
  const api = await createCwmsApi<{
    getCatalogWithDataset: (request?: {
      dataset?: string;
      office?: string;
      pageSize?: number;
    }) => Promise<{
      entries?: unknown[];
      "next-page"?: string;
    }>;
  }>("CatalogApi");

  const locationsWithTimeSeries = new Set<string>();
  if (api) {
    try {
      const { office } = getCdaConfig();
      let pageToken: string | undefined = undefined;
      
      // We should ideally fetch all pages to be accurate, 
      // but for a quick check, even a large first page might be enough.
      // However, to be fully compliant with "page-aware" requirement:
      do {
        const response: any = await api.getCatalogWithDataset({
          dataset: "TIMESERIES",
          office,
          pageSize: 5000, // Large page for catalog
          ...(pageToken ? { page: pageToken } : {})
        });
        
        const entries = (response.entries ?? []) as TimeSeriesCatalogEntryLike[];
        entries.forEach(entry => {
          const tsId = entry.name || "";
          const parts = parseTimeSeriesId(tsId);
          if (parts.location) {
            locationsWithTimeSeries.add(parts.location);
          }
        });
        
        pageToken = response["next-page"];
      } while (pageToken);

    } catch (e) {
      console.error("Failed to fetch time series catalog for published locations", e);
      // Fallback: assume all might have children if we can't check
    }
  }

  return {
    columns: [
      { id: "locationId", header: "Location", accessorKey: "locationId", group: "Identification", defaultVisible: true },
      { id: "timeSeriesId", header: "Time Series ID", accessorKey: "timeSeriesId", group: "Identification", defaultVisible: true },
    ],
    rows: metadataCatalog.rows.map((metadata) => ({
      id: metadata.location,
      kind: "location",
      label: metadata.location,
      locationId: metadata.location,
      office: metadata.office,
      hasChildren: locationsWithTimeSeries.size > 0 ? locationsWithTimeSeries.has(metadata.location) : true,
      selectable: false,
    })),
    pageInfo: metadataCatalog.pageInfo,
  };
}

export async function fetchTimeSeriesByLocation(locationId: string): Promise<PublishedTimeSeriesAssignment[]> {
  const api = await createCwmsApi<{
    getCatalogWithDataset: (request?: {
      dataset?: string;
      office?: string;
      like?: string;
    }) => Promise<{
      entries?: unknown[];
    }>;
  }>("CatalogApi");

  if (!api) {
    throw new Error("CWMS catalog API client is unavailable.");
  }

  const { office } = getCdaConfig();
  
  // Use 'like' to filter by location prefix if exact match is not directly supported in catalog this way,
  // but usually 'like' on name with 'LOCATION.*' works for TS catalog.
  const response = await api.getCatalogWithDataset({
    dataset: "TIMESERIES",
    office,
    like: `${locationId}.*`,
  });

  const entries = (response.entries ?? []) as TimeSeriesCatalogEntryLike[];
  return entries
    .filter(entry => {
      // Ensure it's exactly for this location (starts with locationId followed by a dot)
      const tsId = (entry as any)["timeseries-id"] || (entry as any).name || "";
      return tsId.startsWith(`${locationId}.`);
    })
    .map((entry, index) => {
      const row = mapTimeSeriesCatalogEntry(entry, index);
      return {
        ...row,
        timeSeriesId: row.label,
        parameter: (row.parameter as string) ?? "",
      } as PublishedTimeSeriesAssignment;
    });
}

export async function fetchParameters(): Promise<string[]> {
  const api = await createCwmsApi<{
    getParameters: (request?: {
      office?: string;
    }) => Promise<Array<{ name: string }>>;
  }>("ParametersApi");

  if (!api) {
    // Fallback if API not available or not yet defined in cwmsjs types
    return ["Stage", "Flow", "Precip", "Temp", "Storage", "Elev"];
  }

  try {
    const parameters = await api.getParameters({
      office: getCdaConfig().office
    });
    return parameters.map(p => p.name).sort();
  } catch (e) {
    console.error("Failed to fetch parameters", e);
    return ["Stage", "Flow", "Precip", "Temp", "Storage", "Elev"];
  }
}

export async function fetchAvailableTimeSeries(locationId: string, parameter: string): Promise<PublishedTimeSeriesAssignment[]> {
  const api = await createCwmsApi<{
    getCatalogWithDataset: (request?: {
      dataset?: string;
      office?: string;
      like?: string;
    }) => Promise<{
      entries?: unknown[];
    }>;
  }>("CatalogApi");

  if (!api) {
    throw new Error("CWMS catalog API client is unavailable.");
  }

  const { office } = getCdaConfig();
  
  // Search for time series that match location and parameter
  // TS ID format: Location.Parameter.Type.Interval.Duration.Version
  const response = await api.getCatalogWithDataset({
    dataset: "TIMESERIES",
    office,
    like: `${locationId}.${parameter}.*`,
  });

  const entries = (response.entries ?? []) as TimeSeriesCatalogEntryLike[];
  return entries.map((entry, index) => {
    const row = mapTimeSeriesCatalogEntry(entry, index);
    return {
      ...row,
      timeSeriesId: row.label,
      parameter: (row.parameter as string) ?? "",
    } as PublishedTimeSeriesAssignment;
  });
}
