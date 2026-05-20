import { X } from "lucide-react";
import PlotImport from "react-plotly.js";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fetchPlotData, fetchPlotSeriesData, type PlotSeriesData } from "../services/inventoryServices";
import { fetchLocationMetadataById } from "../services/locationMetadataService";
import { GwCheckbox, GwInput } from "./GroundworkControls";
import { GeoSelectionMap } from "./GeoSelectionMap";
import type { PlotPoint, SelectedEntity, TimeWindow } from "../types";

const PlotComponent = (() => {
  if (typeof PlotImport === "function") return PlotImport as ComponentType<any>;
  const maybeDefault = (PlotImport as unknown as { default?: unknown }).default;
  if (typeof maybeDefault === "function") return maybeDefault as ComponentType<any>;
  return null;
})();

interface PlotWorkspaceProps {
  open: boolean;
  initialMode?: "chart" | "table" | "map";
  selections: SelectedEntity[];
  timeWindow: TimeWindow;
  timezone: string;
  onClose: () => void;
}

interface ParameterGroup {
  parameter: string;
  series: SelectedEntity[];
}

interface MapLocationPoint {
  locationId: string;
  latitude: number;
  longitude: number;
  locationKind?: string;
  locationSelected: boolean;
  series: SelectedEntity[];
}

const VIEWPORT_Y_GAP = 0.03;

function getQualityKey(seriesName: string): string {
  return `${seriesName}__quality`;
}

function toPlotDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function toPlotMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatNumericCell(value: unknown, precision: number): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(precision);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed.toFixed(precision);
    return value;
  }

  return String(value);
}

function parseCoordinate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizeLocationId(value: string): string {
  return value.trim().toUpperCase();
}

function getSeriesLocationId(selection: SelectedEntity): string {
  if (selection.locationId && selection.locationId.trim().length > 0) return sanitizeLocationId(selection.locationId);
  const parts = selection.label.split(".");
  return sanitizeLocationId(parts[0] ?? selection.label);
}

function buildAsciiSparkline(values: number[], targetLength = 16): string {
  if (!values.length) return "No data";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const chars = ".:-=+*#%@";
  const samples = values.length <= targetLength
    ? values
    : Array.from({ length: targetLength }, (_, index) => {
        const sourceIndex = Math.floor((index * (values.length - 1)) / Math.max(targetLength - 1, 1));
        return values[sourceIndex];
      });

  return samples
    .map((value) => {
      const normalized = (value - min) / span;
      const charIndex = Math.min(chars.length - 1, Math.max(0, Math.round(normalized * (chars.length - 1))));
      return chars[charIndex];
    })
    .join("");
}

function getGroupYAxisTitle(group: ParameterGroup): string {
  const parameterLabel = group.parameter?.trim() || "Parameter";
  const units = Array.from(new Set(group.series.map((series) => series.units).filter((unit): unit is string => Boolean(unit?.trim()))));
  if (units.length === 0) return parameterLabel;
  return `${parameterLabel} (${units.join(", ")})`;
}

function buildViewportBorderShapes(rows: number, ygap: number) {
  if (rows <= 0) return [];
  const rowHeight = (1 - (rows - 1) * ygap) / rows;

  return Array.from({ length: rows }, (_, index) => {
    const y0 = index * (rowHeight + ygap);
    const y1 = y0 + rowHeight;
    return {
      type: "rect",
      xref: "paper",
      yref: "paper",
      x0: 0,
      x1: 1,
      y0,
      y1,
      line: { color: "#9aa8b3", width: 1 },
      fillcolor: "rgba(255,255,255,0)",
      layer: "below",
    };
  });
}

export function PlotWorkspace({ open, initialMode = "chart", selections, timeWindow, timezone, onClose }: PlotWorkspaceProps) {
  function extractTimeZoneId(tzString: string): string {
    const match = tzString.match(/([A-Z]{3,4})$/);
    return match ? match[1] : "UTC";
  }

  function extractParameterFromTimeSeriesId(timeSeriesId: string): string {
    const parts = timeSeriesId.split(".");
    return parts[1] ?? "";
  }

  const [data, setData] = useState<PlotPoint[]>([]);
  const [seriesData, setSeriesData] = useState<PlotSeriesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"chart" | "table" | "map">(initialMode);
  const [precision, setPrecision] = useState(2);
  const [showQualityValues, setShowQualityValues] = useState(false);
  const [locationCoordinates, setLocationCoordinates] = useState<Map<string, { latitude?: number; longitude?: number; locationKind?: string }>>(new Map());
  const [selectedMapLocationId, setSelectedMapLocationId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) setShowQualityValues(false);
  }, [open]);

  useEffect(() => {
    if (!open) setSelectedMapLocationId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    fetchLocationMetadataById()
      .then((metadataById) => {
        if (!active) return;
        const byLocation = new Map<string, { latitude?: number; longitude?: number; locationKind?: string }>();
        metadataById.forEach((metadata, locationId) => {
          byLocation.set(sanitizeLocationId(locationId), {
            latitude: parseCoordinate(metadata.latitude ?? metadata.publishedLatitude),
            longitude: parseCoordinate(metadata.longitude ?? metadata.publishedLongitude),
            locationKind: typeof metadata.locationKind === "string" ? metadata.locationKind : undefined,
          });
        });
        setLocationCoordinates(byLocation);
      })
      .catch(() => {
        if (active) setLocationCoordinates(new Map());
      });

    return () => {
      active = false;
    };
  }, [open]);

  const parameterGroups = useMemo(() => {
    const timeSeries = selections.filter((selection) => selection.kind === "timeSeries");
    if (timeSeries.length === 0) return [];
    
    const groups = new Map<string, ParameterGroup>();
    for (const series of timeSeries) {
      const param = extractParameterFromTimeSeriesId(series.label);
      if (!groups.has(param)) {
        groups.set(param, { parameter: param, series: [] });
      }
      groups.get(param)!.series.push(series);
    }
    
    return Array.from(groups.values());
  }, [selections]);

  const selectedSeries = useMemo(() => parameterGroups.flatMap((group) => group.series), [parameterGroups]);

  const mapPoints = useMemo<MapLocationPoint[]>(() => {
    const byLocation = new Map<string, MapLocationPoint>();

    const upsertLocation = (
      locationIdRaw: string,
      options: {
        latitude?: number;
        longitude?: number;
        locationKind?: string;
        locationSelected?: boolean;
        series?: SelectedEntity;
      },
    ) => {
      const locationId = sanitizeLocationId(locationIdRaw);
      if (!locationId) return;

      const existing = byLocation.get(locationId) ?? {
        locationId,
        latitude: Number.NaN,
        longitude: Number.NaN,
        locationSelected: false,
        series: [],
      };

      const fallback = locationCoordinates.get(locationId);
      const lat = options.latitude ?? fallback?.latitude;
      const lon = options.longitude ?? fallback?.longitude;
      const locationKind = options.locationKind ?? fallback?.locationKind;

      if (typeof lat === "number" && Number.isFinite(lat)) existing.latitude = lat;
      if (typeof lon === "number" && Number.isFinite(lon)) existing.longitude = lon;
      if (typeof locationKind === "string" && locationKind.trim().length > 0) existing.locationKind = locationKind;
      if (options.locationSelected) existing.locationSelected = true;
      if (options.series) existing.series.push(options.series);

      byLocation.set(locationId, existing);
    };

    for (const selection of selections) {
      if (selection.kind === "location") {
        upsertLocation(selection.locationId ?? selection.label, {
          latitude: parseCoordinate(selection.latitude),
          longitude: parseCoordinate(selection.longitude),
          locationSelected: true,
        });
      }

      if (selection.kind === "timeSeries") {
        upsertLocation(getSeriesLocationId(selection), {
          latitude: parseCoordinate(selection.latitude),
          longitude: parseCoordinate(selection.longitude),
          series: selection,
        });
      }
    }

    return Array.from(byLocation.values()).filter(
      (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    );
  }, [locationCoordinates, selections]);

  const sparklineByLocation = useMemo(() => {
    const sparklines = new Map<string, string>();

    for (const point of mapPoints) {
      const values = point.series.flatMap((series) => {
        const points = seriesData.find((candidate) => candidate.seriesName === series.label)?.points ?? [];
        return points
          .map((candidate) => candidate.value)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      });
      sparklines.set(point.locationId, buildAsciiSparkline(values));
    }

    return sparklines;
  }, [mapPoints, seriesData]);

  const hasMapEligibleSelection = useMemo(
    () => selections.some((selection) => selection.kind === "location" || selection.kind === "timeSeries"),
    [selections],
  );

  const mapRenderPoints = useMemo(
    () =>
      mapPoints.map((point) => {
        const sparklineValues = point.series.flatMap((series) => {
          const points = seriesData.find((candidate) => candidate.seriesName === series.label)?.points ?? [];
          return points
            .map((candidate) => candidate.value)
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        });

        return {
          locationId: point.locationId,
          latitude: point.latitude,
          longitude: point.longitude,
          locationKind: point.locationKind,
          locationSelected: point.locationSelected,
          seriesCount: point.series.length,
          seriesIds: point.series.map((series) => series.label),
          sparklineValues: sparklineValues.slice(-32),
          sparklineLabel: sparklineByLocation.get(point.locationId) ?? "No data",
        };
      }),
    [mapPoints, seriesData, sparklineByLocation],
  );

  const timezoneId = useMemo(() => extractTimeZoneId(timezone), [timezone]);

  const formattedDates = useMemo(() => {
    return new Map(
      data.map((point) => {
        const ms = Number(point.date);
        if (Number.isNaN(ms)) return [point.date, String(point.date)] as const;
        return [
          point.date,
          new Date(ms).toLocaleString("en-US", {
            timeZone: timezoneId,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        ] as const;
      }),
    );
  }, [data, timezoneId]);

  const tableColumnCount = 1 + selectedSeries.length + (showQualityValues ? selectedSeries.length : 0);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 30,
    overscan: 20,
    enabled: mode === "table",
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows.length ? virtualRows[0]?.start ?? 0 : 0;
  const bottomPadding = virtualRows.length
    ? rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0;

  useEffect(() => {
    if (!open || !parameterGroups.length) return;
    setLoading(true);
    setError(null);
    const allSeriesNames = parameterGroups.flatMap((group) => group.series.map((s) => s.label));
    Promise.all([
      fetchPlotData(allSeriesNames, timeWindow),
      fetchPlotSeriesData(allSeriesNames, timeWindow),
    ])
      .then(([tableRows, plotSeries]) => {
        setData(tableRows);
        setSeriesData(plotSeries);
      })
      .catch((caught: unknown) => {
        setData([]);
        setSeriesData([]);
        setError(caught instanceof Error ? caught.message : "Unable to load plot data.");
      })
      .finally(() => setLoading(false));
  }, [open, parameterGroups, timeWindow]);

  if (!open) return null;

  return (
    <div className="modal-backdrop plot-backdrop">
      <section className="plot-workspace" role="dialog" aria-modal="true" aria-label="Visualization Workspace">
        <header>
          <div>
            <strong>Visualization Workspace</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close plot workspace"><X size={16} /></button>
        </header>
        <div className="segmented">
          <button type="button" className={mode === "chart" ? "active" : ""} onClick={() => setMode("chart")}>Chart</button>
          <button type="button" className={mode === "table" ? "active" : ""} onClick={() => setMode("table")}>Table</button>
          <button type="button" className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}>Map</button>
          <div className="plot-shared-controls">
            <label htmlFor="plot-precision">Precision</label>
            <GwInput
              id="plot-precision"
              type="number"
              min={0}
              max={8}
              step={1}
              value={precision}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) return;
                const next = Math.min(8, Math.max(0, Math.trunc(parsed)));
                setPrecision(next);
              }}
              aria-label="Decimal precision"
            />
          </div>
          {mode === "table" && (
            <div className="plot-table-controls">
              <GwCheckbox
                id="show-quality-values"
                label="Show quality values"
                checked={showQualityValues}
                compact
                onChange={(event) => setShowQualityValues(event.target.checked)}
              />
            </div>
          )}
        </div>
        {loading ? (
          <div className="state-overlay">Loading time series data...</div>
        ) : error ? (
          <div className="state-overlay error">
            <strong>Unable to load plot data.</strong>
            <span>{error}</span>
          </div>
        ) : mode === "map" ? (
          !hasMapEligibleSelection ? (
            <div className="state-overlay">Select locations or time series to open a map.</div>
          ) : !mapPoints.length ? (
            <div className="state-overlay">No mapped coordinates available in the current selection.</div>
          ) : (
            <div className="map-panel">
              <div className="map-plot-wrap">
                <GeoSelectionMap points={mapRenderPoints} selectedLocationId={selectedMapLocationId} />
              </div>
              <section className="map-summary" aria-label="Map series summary">
                <strong>Series Summary</strong>
                <div className="map-summary-grid">
                  {mapRenderPoints.map((point) => (
                    <article
                      key={point.locationId}
                      className={selectedMapLocationId === point.locationId ? "map-summary-card active" : "map-summary-card"}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedMapLocationId(point.locationId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedMapLocationId(point.locationId);
                        }
                      }}
                    >
                      <div>
                        <span>{point.locationId}</span>
                        <small>{point.seriesCount} time series</small>
                      </div>
                      {point.seriesIds.length > 0 && (
                        <ul className="map-summary-id-list" aria-label={`Series ids for ${point.locationId}`}>
                          {point.seriesIds.map((seriesId) => (
                            <li key={seriesId}>{seriesId}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )
        ) : !parameterGroups.length ? (
          <div className="state-overlay">No time series selected for plotting.</div>
        ) : mode === "chart" ? (
          <div className="multi-chart-panel">
            {PlotComponent ? (
            <PlotComponent
              data={parameterGroups.flatMap((group, rowIndex) =>
                group.series.map((selection, seriesIndex) => {
                  const selectedSeriesData = seriesData.find((series) => series.seriesName === selection.label);
                  const tracePoints = (selectedSeriesData?.points ?? [])
                    .map((point) => ({
                      x: toPlotDate(point.date),
                      t: toPlotMillis(point.date),
                      y: point.value,
                    }))
                    .filter((point) => point.x !== null && point.t !== null)
                    .sort((a, b) => (a.t as number) - (b.t as number));

                  return {
                    x: tracePoints.map((point) => point.x),
                    y: tracePoints.map((point) => point.y),
                    type: "scatter",
                    mode: "lines",
                    name: selection.label,
                    xaxis: rowIndex === 0 ? "x" : `x${rowIndex + 1}`,
                    yaxis: rowIndex === 0 ? "y" : `y${rowIndex + 1}`,
                    line: { color: colors[seriesIndex % colors.length]},
                    connectgaps: false,
                    hovertemplate: `%{x}<br>%{y:.${precision}f}<extra>${selection.label}</extra>`,
                  };
                })
              )}
              layout={{
                autosize: true,
                margin: { t: 28, b: 84, l: 120, r: 20 },
                legend: {
                  orientation: "h",
                  yanchor: "top",
                  y: -0.22,
                  xanchor: "center",
                  x: 0.5,
                },
                paper_bgcolor: "#f7f9fb",
                plot_bgcolor: "#ffffff",
                grid: { rows: parameterGroups.length, columns: 1, pattern: "independent", ygap: VIEWPORT_Y_GAP },
                shapes: buildViewportBorderShapes(parameterGroups.length, VIEWPORT_Y_GAP),
                ...Object.fromEntries(parameterGroups.map((_, index) => {
                  const axisNumber = index + 1;
                  const axisName = axisNumber === 1 ? "xaxis" : `xaxis${axisNumber}`;
                  const isBottomAxis = axisNumber === parameterGroups.length;
                  return [axisName, {
                    type: "date",
                    tickmode: "auto",
                    tickformat: "%m/%d %H:%M",
                    tickangle: -45,
                    showticklabels: isBottomAxis,
                    side: "bottom",
                    domain: [0, 1],
                    automargin: isBottomAxis,
                    anchor: axisNumber === 1 ? "y" : `y${axisNumber}`,
                  }];
                })),

                ...Object.fromEntries(parameterGroups.map((group, index) => {
                  const axisNumber = index + 1;
                  const axisName = axisNumber === 1 ? "yaxis" : `yaxis${axisNumber}`;
                  return [axisName, {
                    title: {
                      text: getGroupYAxisTitle(group),
                      standoff: 10,
                    },
                    anchor: axisNumber === 1 ? "x" : `x${axisNumber}`,
                    side: "left",
                    automargin: true,
                  }];
                })),
              }}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
              config={{ displayModeBar: true, displaylogo: false, responsive: true }}
            />
            ) : (
              <div className="state-overlay error">
                <strong>Plot component failed to initialize.</strong>
                <span>Check react-plotly.js module compatibility for this build.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="plot-table-wrap" ref={tableContainerRef}>
            <table className="plot-table">
              <thead className="sticky-header">
                <tr>
                  <th>Date</th>
                  {selectedSeries.map((selection) => (
                    <th key={selection.id}>
                      {selection.label}
                      {selection.units && <span className="units"> ({selection.units})</span>}
                    </th>
                  ))}
                  {showQualityValues && selectedSeries.map((selection) => (
                    <th key={`${selection.id}-quality`}>Q: {selection.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topPadding > 0 && (
                  <tr style={{ height: `${topPadding}px` }}>
                    <td colSpan={tableColumnCount} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const point = data[virtualRow.index];
                  return (
                    <tr key={point.date} style={{ height: `${virtualRow.size}px` }}>
                      <td>{formattedDates.get(point.date) ?? String(point.date)}</td>
                      {selectedSeries.map((selection) => <td key={selection.id}>{formatNumericCell(point[selection.label], precision)}</td>)}
                      {showQualityValues && selectedSeries.map((selection) => {
                        const quality = point[getQualityKey(selection.label)];
                        return <td key={`${selection.id}-quality`}>{quality ?? ""}</td>;
                      })}
                    </tr>
                  );
                })}
                {bottomPadding > 0 && (
                  <tr style={{ height: `${bottomPadding}px` }}>
                    <td colSpan={tableColumnCount} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const colors = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#393b79",
  "#637939",
  "#8c6d31",
  "#843c39",
  "#7b4173",
  "#3182bd",
  "#31a354",
  "#756bb1",
  "#636363",
  "#e6550d",
];
