import { BarChart3, MapPinned, Table2, Trash2, X } from "lucide-react";
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

export function SelectionTray({ selections, onRemove, onClear, onOpenPlot, onOpenTable, onOpenMap }: SelectionTrayProps) {
  const counts = selections.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="selection-tray" aria-label="Shared selections">
      <div className="tray-summary">
        <strong>Selections</strong>
        {Object.entries(counts).map(([kind, count]) => (
          <span key={kind}>{kind}: {count}</span>
        ))}
      </div>
      <div className="selection-list">
        {selections.length === 0 ? (
          <span className="muted">Select rows from any tab to stage plot and tabulation work.</span>
        ) : (
          selections.map((selection) => (
            <GwButton key={`${selection.kind}-${selection.id}`} type="button" variant="subtle" className="selection-pill" onClick={() => onRemove(selection.id)}>
              <span>{selection.label}</span>
              <X size={13} />
            </GwButton>
          ))
        )}
      </div>
      <div className="tray-actions">
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
        <GwButton type="button" onClick={onClear}>
          <Trash2 size={14} />
          Clear
        </GwButton>
      </div>
    </section>
  );
}
