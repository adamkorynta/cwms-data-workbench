import { RefreshCw, X } from "lucide-react";
import PlotImport from "react-plotly.js";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { InventoryRow } from "../types";
import { fetchRatingEffectiveDateEditorData, type RatingEffectiveDateEditorData, type RatingEffectiveDatePoint } from "../services/ratingsService";

interface RatingEffectiveDateEditorProps {
  open: boolean;
  row: InventoryRow | null;
  onClose: () => void;
}

interface CurveSeries {
  openingLabel: string;
  points: Array<{ x: number; y: number; pointKey: string; seriesLabel: string }>;
  color: string;
}

interface ActiveChartPoint {
  pointKey: string;
  x: number;
  y: number;
  seriesLabel: string;
}

interface PlotlyHoverEvent {
  points?: Array<{
    customdata?: unknown;
  }>;
}

const PlotComponent = (() => {
  if (typeof PlotImport === "function") return PlotImport as ComponentType<any>;
  const maybeDefault = (PlotImport as unknown as { default?: unknown }).default;
  if (typeof maybeDefault === "function") return maybeDefault as ComponentType<any>;
  return null;
})();

const curvePalette = [
  "#2947ff",
  "#ff3030",
  "#20b645",
  "#d91cff",
  "#a67c00",
  "#111111",
  "#13c6c6",
  "#6464ff",
  "#ff9800",
  "#5a5a5a",
];

const denseTabs = ["Rating Data", "Blend", "Reference", "Expanded", "Shifts", "Offsets", "Measurements", "Extensions"];

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function resolveRatingId(row: InventoryRow | null): string {
  if (!row) return "";

  const direct = asText(row.ratingId).trim();
  if (direct) return direct;

  const parentId = asText(row.parentId);
  const parentMatch = parentId.match(/^rating-spec:[^:]*:(.+)$/);
  if (parentMatch?.[1]) return parentMatch[1].trim();

  const rowId = asText(row.id);
  const rowMatch = rowId.match(/^rating-effective:rating-spec:[^:]*:(.+?):/);
  if (rowMatch?.[1]) return rowMatch[1].trim();

  return "";
}

function asNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clonePoint(point: RatingEffectiveDatePoint): RatingEffectiveDatePoint {
  return { ...point };
}

function parseRatingParameterLabels(ratingSpecId: string): { independent: string[]; dependent: string } {
  const firstDot = ratingSpecId.indexOf(".");
  const secondDot = firstDot >= 0 ? ratingSpecId.indexOf(".", firstDot + 1) : -1;
  const parameterPart = firstDot >= 0 && secondDot > firstDot
    ? ratingSpecId.slice(firstDot + 1, secondDot)
    : "";

  const [independentPart = "", dependentPart = ""] = parameterPart.split(";");
  const independent = independentPart
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return {
    independent,
    dependent: dependentPart.trim(),
  };
}

function parseUnits(unitsId: string): { independentUnits: string[]; dependentUnit: string } {
  const [independent = "", dependent = ""] = unitsId.split(";");
  return {
    independentUnits: independent.split(",").map((unit) => unit.trim()).filter(Boolean),
    dependentUnit: dependent.trim(),
  };
}

function withUnit(label: string, unit?: string): string {
  const normalizedLabel = label.trim();
  const normalizedUnit = (unit ?? "").trim();
  if (!normalizedLabel) return normalizedUnit ? `Value (${normalizedUnit})` : "Value";
  return normalizedUnit ? `${normalizedLabel} (${normalizedUnit})` : normalizedLabel;
}

function buildPointKey(point: RatingEffectiveDatePoint, index: number): string {
  return `${index}:${point.otherIndependentValue}:${point.independentValue}:${point.dependentValue}`;
}

export function RatingEffectiveDateEditor({ open, row, onClose }: RatingEffectiveDateEditorProps) {
  const ratingId = resolveRatingId(row);
  const effectiveDate = asText(row?.effectiveDate) || asText(row?.label);
  const office = asText(row?.office) || undefined;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RatingEffectiveDateEditorData | null>(null);
  const [draftPoints, setDraftPoints] = useState<RatingEffectiveDatePoint[]>([]);
  const [hoverPointKey, setHoverPointKey] = useState<string | null>(null);
  const plotHostRef = useRef<any>(null);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const loadEditorData = useCallback(() => {
    if (!ratingId || !effectiveDate) return;
    setLoading(true);
    setError(null);

    fetchRatingEffectiveDateEditorData(ratingId, effectiveDate, office)
      .then((nextData) => {
        setData(nextData);
        setDraftPoints(nextData.points.map(clonePoint));
        setHoverPointKey(null);
      })
      .catch((error_: unknown) => {
        setData(null);
        setDraftPoints([]);
        setError(error_ instanceof Error ? error_.message : "Unable to retrieve rating for selected effective date.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [effectiveDate, office, ratingId]);

  const hasDraftChanges = useMemo(() => {
    if (!data) return false;
    if (data.points.length !== draftPoints.length) return true;
    return data.points.some((point, index) => {
      const draft = draftPoints[index];
      return !draft
        || point.otherIndependentValue !== draft.otherIndependentValue
        || point.independentValue !== draft.independentValue
        || point.dependentValue !== draft.dependentValue;
    });
  }, [data, draftPoints]);

  const parameterLabels = useMemo(() => parseRatingParameterLabels(data?.ratingSpecId || ratingId), [data?.ratingSpecId, ratingId]);
  const units = useMemo(() => parseUnits(data?.unitsId || ""), [data?.unitsId]);
  const hasSecondaryIndependent = useMemo(
    () => parameterLabels.independent.length > 1 || draftPoints.some((point) => asText(point.otherIndependentValue).trim().length > 0),
    [draftPoints, parameterLabels.independent.length],
  );

  const curveSeries = useMemo<CurveSeries[]>(() => {
    if (!hasSecondaryIndependent) {
      const points = draftPoints
        .map((point, index) => {
          const x = asNumber(point.dependentValue);
          const y = asNumber(point.independentValue);
          if (x === null || y === null) return null;
          const pointKey = buildPointKey(point, index);
          return { x, y, pointKey, seriesLabel: "" };
        })
        .filter((point): point is { x: number; y: number; pointKey: string; seriesLabel: string } => point !== null)
        .sort((left, right) => left.x - right.x);

      return [{ openingLabel: "", points, color: curvePalette[0] }];
    }

    const grouped = new Map<string, Array<{ x: number; y: number; pointKey: string; seriesLabel: string }>>();

    for (const [index, point] of draftPoints.entries()) {
      const x = asNumber(point.dependentValue);
      const y = asNumber(point.independentValue);
      if (x === null || y === null) continue;
      const opening = point.otherIndependentValue || "0.0";
      const rows = grouped.get(opening) ?? [];
      const pointKey = buildPointKey(point, index);
      rows.push({ x, y, pointKey, seriesLabel: opening });
      grouped.set(opening, rows);
    }

    return [...grouped.entries()]
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([openingLabel, points], index) => ({
        openingLabel,
        points: points.sort((left, right) => left.x - right.x),
        color: curvePalette[index % curvePalette.length],
      }));
  }, [draftPoints, hasSecondaryIndependent]);

  const activeChartPoint = useMemo<ActiveChartPoint | null>(() => {
    if (!hoverPointKey) return null;
    for (const series of curveSeries) {
      const found = series.points.find((point) => point.pointKey === hoverPointKey);
      if (found) {
        return {
          pointKey: found.pointKey,
          x: found.x,
          y: found.y,
          seriesLabel: found.seriesLabel || series.openingLabel,
        };
      }
    }
    return null;
  }, [curveSeries, hoverPointKey]);

  useEffect(() => {
    if (!hoverPointKey) return;
    if (!activeChartPoint) setHoverPointKey(null);
  }, [activeChartPoint, hoverPointKey]);

  const secondaryIndependentLabel = parameterLabels.independent[0] || "Independent 1";
  const primaryIndependentLabel = parameterLabels.independent[parameterLabels.independent.length - 1] || "Independent";
  const dependentLabel = parameterLabels.dependent || "Dependent";
  const secondaryIndependentHeader = withUnit(secondaryIndependentLabel, units.independentUnits[0]);
  const primaryIndependentHeader = withUnit(
    primaryIndependentLabel,
    units.independentUnits[Math.max(0, parameterLabels.independent.length - 1)],
  );
  const dependentHeader = withUnit(dependentLabel, units.dependentUnit);

  const plotData = useMemo(() => {
    const lineTraces: any[] = curveSeries.map((series) => ({
      x: series.points.map((point) => point.x),
      y: series.points.map((point) => point.y),
      customdata: series.points.map((point) => point.pointKey),
      type: "scatter" as const,
      mode: "lines",
      line: {
        color: series.color,
        width: 2,
      },
      hovertemplate: `${dependentHeader}: %{x:.3f}<br>${primaryIndependentHeader}: %{y:.3f}<extra>${hasSecondaryIndependent ? `${secondaryIndependentLabel} ${series.openingLabel}` : primaryIndependentLabel}</extra>`,
      name: hasSecondaryIndependent ? `${secondaryIndependentLabel} ${series.openingLabel}` : primaryIndependentLabel,
      showlegend: curveSeries.length > 1,
    }));

    if (!activeChartPoint) return lineTraces;

    lineTraces.push({
      x: [activeChartPoint.x],
      y: [activeChartPoint.y],
      type: "scatter" as const,
      mode: "markers",
      marker: {
        size: 8,
        color: "#4a90e2",
        line: { color: "#1f2937", width: 1.2 },
      },
      hoverinfo: "skip",
      showlegend: false,
      name: "active-point",
    });

    return lineTraces;
  }, [activeChartPoint, curveSeries, dependentHeader, hasSecondaryIndependent, primaryIndependentHeader, primaryIndependentLabel, secondaryIndependentLabel]);

  const plotRanges = useMemo(() => {
    const allPoints = curveSeries.flatMap((series) => series.points);
    if (!allPoints.length) return null;

    const xValues = allPoints.map((point) => point.x).filter((value) => Number.isFinite(value));
    const yValues = allPoints.map((point) => point.y).filter((value) => Number.isFinite(value));
    if (!xValues.length || !yValues.length) return null;

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const xSpan = Math.max(maxX - minX, Math.max(Math.abs(minX), Math.abs(maxX), 1) * 0.01);
    const ySpan = Math.max(maxY - minY, Math.max(Math.abs(minY), Math.abs(maxY), 1) * 0.01);
    const xPad = xSpan * 0.04;
    const yPad = ySpan * 0.04;

    return {
      x: [minX - xPad, maxX + xPad] as [number, number],
      y: [minY - yPad, maxY + yPad] as [number, number],
    };
  }, [curveSeries]);

  const plotLayout = useMemo(() => ({
    margin: { l: 72, r: 18, t: 10, b: 56 },
    paper_bgcolor: "#f1f3f5",
    plot_bgcolor: "#f1f3f5",
    hovermode: "closest" as const,
    uirevision: "rating-editor-static-axes",
    showlegend: curveSeries.length > 1,
    legend: {
      orientation: "h" as const,
      y: -0.16,
    },
    xaxis: {
      title: dependentHeader,
      autorange: !plotRanges,
      range: plotRanges?.x,
      zeroline: false,
      showgrid: true,
      gridcolor: "#d0d0d0",
      automargin: true,
    },
    yaxis: {
      title: primaryIndependentHeader,
      autorange: !plotRanges,
      range: plotRanges?.y,
      zeroline: false,
      showgrid: true,
      gridcolor: "#d0d0d0",
      automargin: true,
    },
  }), [curveSeries.length, dependentHeader, plotRanges, primaryIndependentHeader]);

  const handlePlotHover = (event: PlotlyHoverEvent) => {
    if (hoverClearTimeoutRef.current !== null) {
      globalThis.clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }

    const pointKey = event?.points?.[0]?.customdata;
    if (typeof pointKey !== "string") return;
    setHoverPointKey((current) => (current === pointKey ? current : pointKey));
  };

  const handlePlotUnhover = () => {
    if (hoverClearTimeoutRef.current !== null) {
      globalThis.clearTimeout(hoverClearTimeoutRef.current);
    }

    // Plotly can emit rapid hover/unhover near axis edges; delay clear to prevent flicker.
    hoverClearTimeoutRef.current = globalThis.setTimeout(() => {
      setHoverPointKey(null);
      hoverClearTimeoutRef.current = null;
    }, 60);
  };

  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current !== null) {
        globalThis.clearTimeout(hoverClearTimeoutRef.current);
        hoverClearTimeoutRef.current = null;
      }
    };
  }, []);

  const handleApply = () => {
    if (!data) return;
    setData({ ...data, points: draftPoints.map(clonePoint) });
  };

  useEffect(() => {
    if (!open || !ratingId || !effectiveDate) return;
    loadEditorData();
  }, [effectiveDate, loadEditorData, open, ratingId]);

  if (!open) return null;

  return (
    <div className="modal-backdrop editor-backdrop" onMouseDown={onClose}>
      <section
        className="rating-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Rating Effective Date Editor"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong>Rating Effective Date Editor</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor"><X size={16} /></button>
        </header>

        <div className="rating-editor-tabs" role="tablist" aria-label="Rating editor sections">
          {denseTabs.map((tab) => (
            <button key={tab} type="button" className={tab === "Rating Data" ? "active" : ""} disabled={tab !== "Rating Data"}>
              {tab}
            </button>
          ))}
        </div>

        <div className="rating-editor-body">
          {loading && <div className="state-overlay">Loading rating data...</div>}
          {error && (
            <div className="state-overlay error">
              <strong>{error}</strong>
              <button type="button" onClick={loadEditorData}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          )}

          {data && !loading && !error && (
            <>
              <section className="rating-editor-meta-strip">
                <div><span>Rating Specification:</span> <strong>{data.ratingSpecId || ratingId}</strong></div>
                <div><span>Effective Date:</span> <strong>{data.effectiveDate || effectiveDate}</strong></div>
                <div><span>Office:</span> <strong>{data.officeId || "-"}</strong></div>
              </section>

              <section className="rating-editor-content">
                <aside className="rating-editor-chart-panel">
                  <div className="rating-editor-chart-wrap">
                    {PlotComponent ? (
                      <PlotComponent
                        ref={plotHostRef}
                        data={plotData}
                        layout={plotLayout}
                        config={{ displayModeBar: false, responsive: true }}
                        useResizeHandler
                        style={{ width: "100%", height: "100%" }}
                        onHover={handlePlotHover}
                        onUnhover={handlePlotUnhover}
                      />
                    ) : (
                      <div className="state-overlay error">Plot component is unavailable.</div>
                    )}
                  </div>
                </aside>

                <div className="rating-editor-grid-panel">
                  <section className="rating-editor-table-wrap">
                    <table className="rating-editor-table">
                      <thead>
                        <tr>
                          {hasSecondaryIndependent && <th>{secondaryIndependentHeader}</th>}
                          <th>{primaryIndependentHeader}</th>
                          <th>{dependentHeader}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftPoints.map((point, index) => (
                          <tr
                            key={`${point.index}-${point.otherIndependentPosition}-${point.otherIndependentValue}-${index}`}
                            className={hoverPointKey === buildPointKey(point, index) ? "active" : ""}
                            onMouseEnter={() => setHoverPointKey(buildPointKey(point, index))}
                            onMouseLeave={() => setHoverPointKey(null)}
                          >
                            {hasSecondaryIndependent && (
                              <td>
                                <input
                                  value={point.otherIndependentValue}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setDraftPoints((current) => current.map((entry, i) => (i === index ? { ...entry, otherIndependentValue: value } : entry)));
                                  }}
                                />
                              </td>
                            )}
                            <td>
                              <input
                                value={point.independentValue}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDraftPoints((current) => current.map((entry, i) => (i === index ? { ...entry, independentValue: value } : entry)));
                                }}
                              />
                            </td>
                            <td>
                              <input
                                value={point.dependentValue}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setDraftPoints((current) => current.map((entry, i) => (i === index ? { ...entry, dependentValue: value } : entry)));
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </section>

            </>
          )}
        </div>

        <footer>
          <button type="button" onClick={() => { if (hasDraftChanges) handleApply(); onClose(); }}>
            OK
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={!hasDraftChanges} onClick={handleApply}>
            Apply
          </button>
        </footer>
      </section>
    </div>
  );
}
