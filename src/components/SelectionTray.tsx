import { BarChart3, ChevronDown, ChevronUp, MapPinned, Table2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedEntity } from "../types";
import { GwButton } from "./GroundworkControls";

interface SelectionTrayProps {
  selections: SelectedEntity[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpenPlot: () => void;
  onOpenTable: () => void;
  onOpenMap: () => void;
}

const kindLabels: Record<string, string> = {
  timeSeries: "Time Series",
  rating: "Ratings",
  level: "Levels",
  locationGroup: "Location Groups",
  timeSeriesGroup: "Time Series Groups",
  location: "Locations",
  measurement: "Measurements",
};

const maxCollapsedItemsPerGroup = 4;
const minDrawerHeight = 112;
const maxDrawerHeight = 360;
const defaultDrawerHeight = 180;
const selectionFlightEventName = "cwms:selection-flight";

interface SelectionFlight {
  id: string;
  count: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  phase: "start" | "end";
}

interface SelectionFlightEventDetail {
  originRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  count: number;
}

export function SelectionTray({ selections, onRemove, onClear, onOpenPlot, onOpenTable, onOpenMap }: SelectionTrayProps) {
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(defaultDrawerHeight);
  const [flights, setFlights] = useState<SelectionFlight[]>([]);
  const [summaryPulse, setSummaryPulse] = useState(false);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const summaryTargetRef = useRef<HTMLDivElement | null>(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const delta = dragState.startY - event.clientY;
      const nextHeight = Math.max(minDrawerHeight, Math.min(maxDrawerHeight, dragState.startHeight + delta));
      setDrawerHeight(nextHeight);
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    globalThis.addEventListener("pointermove", handlePointerMove);
    globalThis.addEventListener("pointerup", handlePointerUp);
    return () => {
      globalThis.removeEventListener("pointermove", handlePointerMove);
      globalThis.removeEventListener("pointerup", handlePointerUp);
    };
  }, [open]);

  useEffect(() => {
    if (selections.length > 0) return;
    setExpandedKinds({});
  }, [selections.length]);

  useEffect(() => {
    const handleSelectionFlight = (event: Event) => {
      const customEvent = event as CustomEvent<SelectionFlightEventDetail>;
      const originRect = customEvent.detail?.originRect;
      const count = customEvent.detail?.count ?? 0;
      if (!originRect || count <= 0) return;

      const targetRect = summaryTargetRef.current?.getBoundingClientRect();
      if (!targetRect) return;

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const startX = originRect.left + originRect.width / 2;
      const startY = originRect.top + originRect.height / 2;
      const endX = targetRect.left + Math.min(110, targetRect.width - 24);
      const endY = targetRect.top + 24;

      setFlights((current) => [
        ...current,
        {
          id,
          count,
          startX,
          startY,
          endX,
          endY,
          phase: "start",
        },
      ]);

      globalThis.requestAnimationFrame(() => {
        setFlights((current) => current.map((flight) => (flight.id === id ? { ...flight, phase: "end" } : flight)));
      });

      if (pulseTimeoutRef.current !== null) {
        globalThis.clearTimeout(pulseTimeoutRef.current);
      }
      setSummaryPulse(false);
      globalThis.requestAnimationFrame(() => {
        setSummaryPulse(true);
      });
      pulseTimeoutRef.current = globalThis.setTimeout(() => {
        setSummaryPulse(false);
        pulseTimeoutRef.current = null;
      }, 620);

      globalThis.setTimeout(() => {
        setFlights((current) => current.filter((flight) => flight.id !== id));
      }, 760);
    };

    globalThis.addEventListener(selectionFlightEventName, handleSelectionFlight);
    return () => {
      globalThis.removeEventListener(selectionFlightEventName, handleSelectionFlight);
      if (pulseTimeoutRef.current !== null) {
        globalThis.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const counts = selections.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});

  const groupedSelections = useMemo(() => {
    const grouped = selections.reduce<Record<string, SelectedEntity[]>>((acc, item) => {
      acc[item.kind] ??= [];
      acc[item.kind].push(item);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([kind, items]) => ({
        kind,
        label: kindLabels[kind] ?? kind,
        items: [...items].sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [selections]);

  const clearKind = (kind: string) => {
    const toRemove = selections.filter((item) => item.kind === kind);
    for (const selection of toRemove) {
      onRemove(selection.id);
    }
  };

  return (
    <section className={`selection-drawer ${open ? "open" : "collapsed"}`} aria-label="Shared selections" style={open ? { height: `${drawerHeight}px` } : undefined}>
      <div className="selection-drawer-bar">
        <div className="tray-actions tray-actions-left">
          <GwButton
            type="button"
            className="drawer-toggle"
            variant="subtle"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="selection-drawer-list"
            aria-label={open ? "Collapse selections" : "Expand selections"}
            title={open ? "Collapse selections" : "Expand selections"}
          >
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </GwButton>
          <GwButton type="button" onClick={onClear} disabled={!selections.length} aria-label="Clear selections" title="Clear selections">
            <Trash2 size={14} />
          </GwButton>
        </div>
        <div className={`tray-summary ${summaryPulse ? "selection-target-pulse" : ""}`} ref={summaryTargetRef}>
          <strong>Selections</strong>
          {Object.entries(counts)
            .sort(([kindA], [kindB]) => (kindLabels[kindA] ?? kindA).localeCompare(kindLabels[kindB] ?? kindB))
            .map(([kind, count]) => (
              <GwButton key={kind} type="button" variant="subtle" className="selection-count-chip" onClick={() => clearKind(kind)} title={`Remove all ${kindLabels[kind] ?? kind}`}>
                <span>{kindLabels[kind] ?? kind}</span>
                <strong>{count}</strong>
                <X size={12} aria-hidden="true" />
              </GwButton>
            ))}
          {selections.length === 0 && <span className="selection-count-empty">No active selections</span>}
        </div>
        <div className="tray-actions tray-actions-right">
          <GwButton type="button" onClick={onOpenPlot} disabled={!selections.length}>
            <BarChart3 size={14} />
            Plot
          </GwButton>
          <GwButton type="button" onClick={onOpenTable} disabled={!selections.length}>
            <Table2 size={14} />
            Tabulate
          </GwButton>
          <GwButton type="button" onClick={onOpenMap} disabled={!selections.length}>
            <MapPinned size={14} />
            Map
          </GwButton>
        </div>
      </div>
      {open && (
        <>
          <div
            className="selection-drawer-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize selection drawer"
            onPointerDown={(event) => {
              event.preventDefault();
              dragStateRef.current = { startY: event.clientY, startHeight: drawerHeight };
            }}
          />
          <div id="selection-drawer-list" className="selection-list">
            {selections.length === 0 ? (
              <span className="muted">Select rows from any tab to stage plot and tabulation work.</span>
            ) : (
              <div className="selection-groups">
                {groupedSelections.map((group) => {
                  const isExpanded = Boolean(expandedKinds[group.kind]);
                  const hiddenCount = Math.max(0, group.items.length - maxCollapsedItemsPerGroup);
                  const visibleItems = isExpanded ? group.items : group.items.slice(0, maxCollapsedItemsPerGroup);

                  return (
                    <section key={group.kind} className="selection-group" aria-label={`${group.label} selections`}>
                      <header className="selection-group-header">
                        <strong>{group.label}</strong>
                        <span>{group.items.length}</span>
                      </header>
                      <div className="selection-group-pills">
                        {visibleItems.map((selection) => (
                          <GwButton
                            key={`${selection.kind}-${selection.id}`}
                            type="button"
                            variant="subtle"
                            className={`selection-pill ${selection.kind === "timeSeries" ? "selection-pill-time-series" : ""}`}
                            onClick={() => onRemove(selection.id)}
                            title={selection.label}
                          >
                            <span>{selection.label}</span>
                            <X size={13} />
                          </GwButton>
                        ))}
                        {hiddenCount > 0 && (
                          <GwButton
                            type="button"
                            variant="subtle"
                            className="selection-pill selection-pill-more"
                            onClick={() =>
                              setExpandedKinds((current) => ({
                                ...current,
                                [group.kind]: !current[group.kind],
                              }))
                            }
                          >
                            {isExpanded ? "Show less" : `+${hiddenCount} more`}
                          </GwButton>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      {flights.map((flight) => (
        <span
          key={flight.id}
          className={`selection-flight ${flight.phase === "end" ? "animate" : ""}`}
          style={{
            left: `${flight.phase === "start" ? flight.startX : flight.endX}px`,
            top: `${flight.phase === "start" ? flight.startY : flight.endY}px`,
          }}
          aria-hidden="true"
        >
          +{flight.count}
        </span>
      ))}
    </section>
  );
}
