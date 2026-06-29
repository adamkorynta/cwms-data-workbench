import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchClobValue } from "../services/inventoryServices";
import type { InventoryRow } from "../types";
import { GwButton } from "./GroundworkControls";

interface ClobValueDialogProps {
  row: InventoryRow | null;
  onClose: () => void;
}

interface ClobValue {
  officeId?: string;
  id?: string;
  description?: string;
  value?: string;
}

export function ClobValueDialog({ row, onClose }: ClobValueDialogProps) {
  const [value, setValue] = useState<ClobValue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const office = typeof row?.office === "string" ? row.office : "";
  const clobId = typeof row?.clobId === "string" ? row.clobId : row?.label ?? "";

  useEffect(() => {
    if (!row || !office || !clobId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setValue(null);

    fetchClobValue(office, clobId)
      .then((nextValue) => {
        if (!cancelled) setValue(nextValue);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load CLOB data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clobId, office, reloadKey, row]);

  if (!row) return null;

  return (
    <div className="modal-backdrop">
      <section className="clob-value-dialog" role="dialog" aria-modal="true" aria-label={`CLOB ${clobId}`}>
        <header>
          <div>
            <strong>CLOB Data</strong>
            <span>{office} / {clobId}</span>
          </div>
          <GwButton type="button" variant="subtle" onClick={onClose} aria-label="Close CLOB data">
            <X size={16} />
          </GwButton>
        </header>
        <div className="dialog-body clob-dialog-body">
          {loading && <div className="state-overlay">Loading CLOB data...</div>}
          {error && (
            <div className="state-overlay error">
              <strong>{error}</strong>
              <GwButton type="button" onClick={() => setReloadKey((current) => current + 1)}>Retry</GwButton>
            </div>
          )}
          {value?.description ? (
            <div className="clob-description">
              <strong>Description</strong>
              <span>{value.description}</span>
            </div>
          ) : null}
          {!loading && !error && (
            <pre className="clob-value">{value?.value ?? "No CLOB value returned for this entry."}</pre>
          )}
        </div>
        <footer>
          <GwButton type="button" onClick={onClose}>Close</GwButton>
        </footer>
      </section>
    </div>
  );
}
