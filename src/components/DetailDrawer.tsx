import { X } from "lucide-react";
import type { InventoryRow } from "../types";
import { asDisplay } from "../utils/ids";
import { GwButton } from "./GroundworkControls";

interface DetailDrawerProps {
  row: InventoryRow | null;
  onClose: () => void;
}

export function DetailDrawer({ row, onClose }: DetailDrawerProps) {
  if (!row) return null;

  const entries = Object.entries(row).filter(([key]) => !["aliases", "kind", "id", "label"].includes(key));
  const aliases = Object.entries(row.aliases ?? {});

  return (
    <aside className="detail-drawer" aria-label="Row details">
      <div className="detail-header">
        <div>
          <span>{row.kind}</span>
          <strong>{row.label}</strong>
        </div>
        <GwButton type="button" variant="subtle" onClick={onClose} aria-label="Close details">
          <X size={16} />
        </GwButton>
      </div>
      <div className="detail-body">
        <section>
          <h3>Metadata</h3>
          <dl>
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{asDisplay(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
        {aliases.length > 0 && (
          <section>
            <h3>Aliases</h3>
            <dl>
              {aliases.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{asDisplay(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </aside>
  );
}
