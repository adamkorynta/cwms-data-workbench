import { useCallback, useLayoutEffect, useState } from "react";
import type { InventoryDataset } from "../types";

const emptyDataset: InventoryDataset = { rows: [], columns: [] };

export function useInventory(loader: () => Promise<InventoryDataset>) {
  const [dataset, setDataset] = useState<InventoryDataset>(emptyDataset);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useLayoutEffect(() => {
    let cancelled = false;
    setDataset(emptyDataset);
    setLoading(true);
    setError(null);

    loader()
      .then((next) => {
        if (!cancelled) setDataset(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load inventory.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loader, reloadToken]);

  return { dataset, loading, error, reload };
}
