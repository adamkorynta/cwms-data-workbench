import { CheckSquare, ChevronLeft, ChevronRight, Columns3, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ColumnDefConfig } from "../types";
import { GwButton, GwCheckbox } from "./GroundworkControls";

interface ColumnDrawerProps {
  columns: ColumnDefConfig[];
  visibleColumnIds: Set<string>;
  onToggle: (columnId: string) => void;
  onShowAll: () => void;
  onDefaults: () => void;
}

export function ColumnDrawer({ columns, visibleColumnIds, onToggle, onShowAll, onDefaults }: ColumnDrawerProps) {
  const [open, setOpen] = useState(false);
  const groups = columns.reduce<Record<string, ColumnDefConfig[]>>((acc, column) => {
    acc[column.group] ??= [];
    acc[column.group].push(column);
    return acc;
  }, {});

  return (
    <aside className={open ? "column-drawer open" : "column-drawer collapsed"}>
      <div className="drawer-header">
        <GwButton
          type="button"
          variant="subtle"
          className="drawer-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? "Collapse columns panel" : "Expand columns panel"}
          title={open ? "Collapse columns panel" : "Expand columns panel"}
        >
          {open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </GwButton>
        <Columns3 size={16} />
        {open && <strong>Columns</strong>}
      </div>
      {open && (
        <>
          <div className="drawer-actions">
            <GwButton type="button" onClick={onShowAll}>
              <CheckSquare size={14} />
              Show All
            </GwButton>
            <GwButton type="button" onClick={onDefaults}>
              <RotateCcw size={14} />
              Defaults
            </GwButton>
          </div>
          <div className="layout-note">Custom Layout: Operations Default</div>
          <div className="column-groups">
            {Object.entries(groups).map(([group, groupColumns]) => (
              <section key={group} className="column-group">
                <h3>{group}</h3>
                {groupColumns.map((column) => (
                  <GwCheckbox
                    key={column.id}
                    id={`column-${column.id}`}
                    className="column-toggle"
                    compact
                    label={column.header}
                    checked={visibleColumnIds.has(column.id)}
                    onChange={() => onToggle(column.id)}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
