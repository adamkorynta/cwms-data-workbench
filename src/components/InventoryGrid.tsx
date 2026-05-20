import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type ColumnFiltersState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, RefreshCw, SearchX } from "lucide-react";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InventoryDataset, InventoryRow, SelectedEntity, TabId } from "../types";
import { asDisplay, getValueByPath } from "../utils/ids";
import { loadVisibleColumns, saveVisibleColumns } from "../utils/preferences";
import { ColumnDrawer } from "./ColumnDrawer";
import { DetailDrawer } from "./DetailDrawer";
import { GwButton, GwCheckbox, GwInput } from "./GroundworkControls";

interface InventoryGridProps {
  tabId: TabId;
  title: string;
  dataset: InventoryDataset;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAddSelections: (entities: SelectedEntity[]) => void;
  onLoadChildren?: (row: InventoryRow) => Promise<InventoryRow[]>;
  toolbar?: React.ReactNode;
}

export function InventoryGrid({ tabId, title, dataset, loading, error, onRetry, onAddSelections, onLoadChildren, toolbar }: InventoryGridProps) {
  const defaultColumns = dataset.columns.filter((column) => column.defaultVisible !== false).map((column) => column.id);
  const requiredVisibleColumns = useMemo(() => {
    if (tabId === "ratings") {
      return dataset.columns
        .filter((column) => column.group === "Identification")
        .map((column) => column.id);
    }
    if (tabId === "location-groups") return ["name", "office", "alias"];
    if (tabId === "time-series") return ["timeSeriesId", "timezone", "first", "last", "intervalOffset"];
    return [];
  }, [dataset.columns, tabId]);
  const showSelectionColumn = tabId !== "ratings" && dataset.rows.some((row) => row.selectable !== false);

  const formatCellValue = (columnId: string, value: unknown) => {
    if (tabId === "time-series" && columnId === "intervalOffset") {
      const text = asDisplay(value).trim();
      if (text === "-2147483648") return "N/A";

      const minutesText = text.endsWith("s") ? text.slice(0, -1) : text;
      const minutes = Number(minutesText);
      if (Number.isFinite(minutes)) {
        const sign = minutes < 0 ? "-" : "";
        let remainingMinutes = Math.abs(minutes);
        const days = Math.floor(remainingMinutes / (24 * 60));
        remainingMinutes -= days * 24 * 60;
        const hours = Math.floor(remainingMinutes / 60);
        remainingMinutes -= hours * 60;

        const parts = [];
        if (days > 0) parts.push(`${days}D`);

        const timeParts = [];
        if (hours > 0) timeParts.push(`${hours}H`);
        if (remainingMinutes > 0) timeParts.push(`${remainingMinutes}M`);

        if (parts.length === 0 && timeParts.length === 0) return "PT0M";
        if (timeParts.length > 0) parts.push(`T${timeParts.join("")}`);
        return `${sign}P${parts.join("")}`;
      }
    }

    return asDisplay(value);
  };

  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [injectedRows, setInjectedRows] = useState<InventoryRow[]>([]);
  const [loadingChildrenByParent, setLoadingChildrenByParent] = useState<Record<string, boolean>>({});
  const [detailRow, setDetailRow] = useState<InventoryRow | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string> | null>(null);

  const allRows = useMemo(() => {
    const unique = new Map<string, InventoryRow>();
    for (const row of dataset.rows) unique.set(row.id, row);
    for (const row of injectedRows) unique.set(row.id, row);
    return [...unique.values()];
  }, [dataset.rows, injectedRows]);

  useLayoutEffect(() => {
    if (dataset.columns.length === 0 || visibleColumnIds !== null) return;

    setVisibleColumnIds(new Set(loadVisibleColumns(tabId, defaultColumns, requiredVisibleColumns)));
  }, [dataset.columns.length, defaultColumns, requiredVisibleColumns, tabId, visibleColumnIds]);

  useEffect(() => {
    if (visibleColumnIds === null) return;

    saveVisibleColumns(tabId, [...visibleColumnIds]);
  }, [tabId, visibleColumnIds]);

  const rows = useMemo(() => {
    const byParent = allRows.reduce<Record<string, InventoryRow[]>>((acc, row) => {
      if (row.parentId) {
        acc[row.parentId] ??= [];
        acc[row.parentId].push(row);
      }
      return acc;
    }, {});

    const visible: InventoryRow[] = [];
    const visit = (row: InventoryRow) => {
      visible.push(row);
      if (expanded[row.id]) byParent[row.id]?.forEach(visit);
    };

    allRows.filter((row) => !row.parentId).forEach(visit);
    return visible;
  }, [allRows, expanded]);

  const byParent = useMemo(
    () =>
      allRows.reduce<Record<string, InventoryRow[]>>((acc, row) => {
        if (row.parentId) {
          acc[row.parentId] ??= [];
          acc[row.parentId].push(row);
        }
        return acc;
      }, {}),
    [allRows],
  );

  const descendantIdsByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    const visit = (rowId: string): string[] => {
      if (map.has(rowId)) return map.get(rowId) ?? [];
      const descendants: string[] = [];
      const children = byParent[rowId] ?? [];
      for (const child of children) {
        descendants.push(child.id);
        descendants.push(...visit(child.id));
      }
      map.set(rowId, descendants);
      return descendants;
    };

    for (const row of allRows) visit(row.id);
    return map;
  }, [allRows, byParent]);

  const childIds = useMemo(() => new Set(allRows.filter((row) => row.parentId).map((row) => row.parentId)), [allRows]);
  const activeVisibleColumnIds = visibleColumnIds ?? new Set<string>();

  const handleToggleExpand = useCallback(
    (row: InventoryRow) => {
      const willExpand = !expanded[row.id];

      if (!willExpand) {
        setExpanded((current) => ({ ...current, [row.id]: false }));
        return;
      }

      if (!onLoadChildren || childIds.has(row.id) || loadingChildrenByParent[row.id]) {
        setExpanded((current) => ({ ...current, [row.id]: true }));
        return;
      }

      // Force the loading affordance to paint before starting network work.
      flushSync(() => {
        setExpanded((current) => ({ ...current, [row.id]: true }));
        setLoadingChildrenByParent((current) => ({ ...current, [row.id]: true }));
      });

      onLoadChildren(row)
        .then((children) => {
          if (!children.length) return;
          setInjectedRows((current) => {
            const known = new Set(current.map((item) => item.id));
            const next = [...current];
            for (const child of children) {
              if (!known.has(child.id)) {
                next.push(child);
                known.add(child.id);
              }
            }
            return next;
          });
        })
        .catch(() => {
          setExpanded((current) => ({ ...current, [row.id]: false }));
        })
        .finally(() => {
          setLoadingChildrenByParent((current) => ({ ...current, [row.id]: false }));
        });
    },
    [childIds, expanded, loadingChildrenByParent, onLoadChildren],
  );

  const columns = useMemo<ColumnDef<InventoryRow>[]>(() => {
    return dataset.columns
      .filter((column) => activeVisibleColumnIds.has(column.id))
      .map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row) => getValueByPath(row, column.accessorKey),
        filterFn: (row, columnId, filterValue) =>
          asDisplay(row.getValue(columnId)).toLowerCase().includes(String(filterValue).toLowerCase()),
        cell: ({ row, getValue }) => {
          const original = row.original;
          const hasChildren = childIds.has(original.id) || original.hasChildren === true;
          const childrenLoading = Boolean(loadingChildrenByParent[original.id]);
          const indent = column.pinned || column === dataset.columns[0] ? (original.depth ?? 0) * 16 : 0;
          return (
            <span className="cell-content" style={{ paddingLeft: indent + 8, paddingRight: 8 }}>
              {column === dataset.columns[0] && hasChildren && (
                <GwButton
                  type="button"
                  variant="subtle"
                  className="tree-toggle"
                  disabled={childrenLoading}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggleExpand(original);
                  }}
                >
                  {expanded[original.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </GwButton>
              )}
              {column === dataset.columns[0] && !hasChildren && <span className="tree-toggle-placeholder" aria-hidden="true" />}
              {column === dataset.columns[0] && childrenLoading && (
                <span className="tree-loading" role="status" aria-live="polite">
                  <RefreshCw size={11} className="tree-loading-icon" />
                  Loading...
                </span>
              )}
              {formatCellValue(column.id, getValue())}
            </span>
          );
        },
        meta: { group: column.group, width: column.width, pinned: column.pinned },
      }));
  }, [activeVisibleColumnIds, childIds, dataset.columns, expanded, handleToggleExpand, loadingChildrenByParent]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: (row) => row.original.selectable !== false,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
  });

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 8,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length ? virtualItems[0]?.start ?? 0 : 0;
  const paddingBottom = virtualItems.length
    ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
    : 0;

  const selectedEntities = allRows
    .filter((row) => selectedRows[row.id] && row.selectable !== false)
    .filter((row) => (tabId === "time-series-groups" ? row.kind === "timeSeries" : true))
    .map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      office: row.office,
      units: typeof row.units === "string" ? row.units : undefined,
      locationId:
        typeof row.location === "string" && row.location.trim().length > 0
          ? row.location
          : row.kind === "location"
            ? row.label
            : undefined,
      latitude: typeof row.latitude === "number" ? row.latitude : undefined,
      longitude: typeof row.longitude === "number" ? row.longitude : undefined,
      tabId,
    }));

  const groupedHeaders = dataset.columns
    .filter((column) => activeVisibleColumnIds.has(column.id))
    .reduce<Array<{ group: string; span: number }>>((acc, column) => {
      const current = acc[acc.length - 1];
      if (current?.group === column.group) current.span += 1;
      else acc.push({ group: column.group, span: 1 });
      return acc;
    }, []);
  const initializingColumns = !loading && !error && dataset.rows.length > 0 && dataset.columns.length > 0 && visibleColumnIds === null;

  return (
    <section className="workbench-panel">
      <div className="grid-toolbar">
        <div>
          <strong>{title}</strong>
        </div>
        <div className="toolbar-actions">
          {toolbar}
          <GwButton type="button" onClick={() => setColumnFilters([])} disabled={!columnFilters.length}>
            <SearchX size={14} />
            Clear Filters
          </GwButton>
          {showSelectionColumn && (
            <GwButton type="button" onClick={() => onAddSelections(selectedEntities)} disabled={!selectedEntities.length}>
              Select
            </GwButton>
          )}
          {showSelectionColumn && (
            <GwButton type="button" onClick={() => setSelectedRows({})}>
              De-select
            </GwButton>
          )}
          <GwButton type="button" onClick={onRetry}>
            <RefreshCw size={14} />
            Refresh
          </GwButton>
        </div>
      </div>
      <div className="grid-and-drawer">
        <div className="grid-wrap" ref={parentRef}>
          {(loading || initializingColumns) && <div className="state-overlay">Loading {title}...</div>}
          {error && (
            <div className="state-overlay error">
              <strong>{error}</strong>
              <button type="button" onClick={onRetry}>Retry</button>
            </div>
          )}
          {dataset.pageInfo?.partial && (
            <div className="state-banner warning">
              Showing partial results. Loaded {dataset.pageInfo.pagesLoaded.toLocaleString()} page
              {dataset.pageInfo.pagesLoaded === 1 ? "" : "s"} before page {dataset.pageInfo.errorPage ?? "?"} failed.
              {dataset.pageInfo.warning ? ` ${dataset.pageInfo.warning}` : ""}
            </div>
          )}
          {!loading && !error && !rows.length && <div className="state-overlay">No data found.</div>}
          <table className="inventory-grid">
            <thead>
              <tr className="group-row">
                {showSelectionColumn && <th aria-label="select column" />}
                {groupedHeaders.map((group, index) => (
                  <th key={`${group.group}-${index}`} colSpan={group.span}>{group.group}</th>
                ))}
              </tr>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {showSelectionColumn && <th className="select-col" />}
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} style={{ minWidth: `${(header.column.columnDef.meta as { width?: number } | undefined)?.width ?? 120}px` }}>
                      <GwButton type="button" variant="subtle" className="header-button" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span>{header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : ""}</span>
                      </GwButton>
                      <GwInput
                        placeholder="Search"
                        aria-label={`Search ${String(header.column.columnDef.header)}`}
                        value={(header.column.getFilterValue() as string) ?? ""}
                        onChange={(event) => header.column.setFilterValue(event.target.value)}
                      />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr style={{ height: `${paddingTop}px` }}>
                  <td colSpan={table.getHeaderGroups()[0].headers.length + (showSelectionColumn ? 1 : 0)} />
                </tr>
              )}
              {virtualItems.map((virtualItem) => {
                const row = table.getRowModel().rows[virtualItem.index];
                return (
                  <tr
                    key={row.original.id}
                    className={selectedRows[row.original.id] ? "selected-row" : ""}
                    onDoubleClick={() => setDetailRow(row.original)}
                    style={{ height: `${virtualItem.size}px` }}
                  >
                    {showSelectionColumn && (
                      <td className="select-col">
                        <GwCheckbox
                          id={`select-${row.original.id}`}
                          compact
                          checked={Boolean(selectedRows[row.original.id])}
                          disabled={row.original.selectable === false}
                          onChange={(event) =>
                            setSelectedRows((current) => {
                              const checked = event.target.checked;
                              const next = { ...current };
                              const idsToSet = [row.original.id, ...(descendantIdsByParent.get(row.original.id) ?? [])];
                              for (const rowId of idsToSet) next[rowId] = checked;
                              return next;
                            })
                          }
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} onClick={() => setDetailRow(row.original)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={table.getHeaderGroups()[0].headers.length + (showSelectionColumn ? 1 : 0)} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ColumnDrawer
          columns={dataset.columns}
          visibleColumnIds={activeVisibleColumnIds}
          onToggle={(columnId) =>
            setVisibleColumnIds((current) => {
              const next = new Set(current ?? []);
              if (next.has(columnId)) next.delete(columnId);
              else next.add(columnId);
              return next;
            })
          }
          onShowAll={() => setVisibleColumnIds(new Set(dataset.columns.map((column) => column.id)))}
          onDefaults={() => setVisibleColumnIds(new Set(dataset.columns.filter((column) => column.defaultVisible !== false).map((column) => column.id)))}
        />
      </div>
      <DetailDrawer row={detailRow} onClose={() => setDetailRow(null)} />
    </section>
  );
}
