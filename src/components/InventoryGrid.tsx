import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type ColumnFiltersState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, MoreHorizontal, RefreshCw, SearchX } from "lucide-react";
import { flushSync } from "react-dom";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InventoryDataset, InventoryRow, SelectedEntity, TabId } from "../types";
import { asDisplay, getValueByPath } from "../utils/ids";
import { loadVisibleColumns, saveVisibleColumns } from "../utils/preferences";
import { ColumnDrawer } from "./ColumnDrawer";
import { GwButton, GwCheckbox, GwInput } from "./GroundworkControls";
import { RatingEffectiveDateEditor } from "./RatingEffectiveDateEditor";

interface InventoryGridProps {
  tabId: TabId;
  title: string;
  dataset: InventoryDataset;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAddSelections: (entities: SelectedEntity[]) => void;
  onLoadChildren?: (row: InventoryRow) => Promise<InventoryRow[]>;
  onRowAction?: (row: InventoryRow) => void;
  rowActionLabel?: string;
  toolbar?: React.ReactNode;
}

interface RowActionsMenuState {
  rowId: string;
  label: string;
  x: number;
  y: number;
}

const selectionFlightEventName = "cwms:selection-flight";

export function InventoryGrid({ tabId, title, dataset, loading, error, onRetry, onAddSelections, onLoadChildren, onRowAction, rowActionLabel, toolbar }: InventoryGridProps) {
  const actionsColumnId = "__actions__";
  const defaultColumns = dataset.columns.filter((column) => column.defaultVisible !== false).map((column) => column.id);
  const requiredVisibleColumns = useMemo(() => {
    if (tabId === "ratings") {
      return dataset.columns
        .filter((column) => column.group === "Identification")
        .map((column) => column.id);
    }
    if (tabId === "location-groups") return ["name", "office", "alias"];
    if (tabId === "time-series") return ["timeSeriesId", "timezone", "first", "last", "intervalOffset"];
    if (tabId === "published") return ["locationId", "timeSeriesId"];
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
  const [actionsMenu, setActionsMenu] = useState<RowActionsMenuState | null>(null);
  const [ratingEditorRow, setRatingEditorRow] = useState<InventoryRow | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string> | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const emitSelectionFlight = useCallback((originRect: DOMRect, count: number) => {
    if (count <= 0) return;

    globalThis.dispatchEvent(
      new CustomEvent(selectionFlightEventName, {
        detail: {
          originRect: {
            left: originRect.left,
            top: originRect.top,
            width: originRect.width,
            height: originRect.height,
          },
          count,
        },
      }),
    );
  }, []);

  const getSelectionColumnOriginRect = useCallback(
    (rowElement?: Element | null): DOMRect | null => {
      if (!showSelectionColumn) return null;

      const rowCell = rowElement?.querySelector("td.select-col");
      if (rowCell instanceof HTMLElement) return rowCell.getBoundingClientRect();

      const headerCell = parentRef.current?.querySelector("thead th.select-col");
      if (headerCell instanceof HTMLElement) return headerCell.getBoundingClientRect();

      const firstBodyCell = parentRef.current?.querySelector("tbody td.select-col");
      if (firstBodyCell instanceof HTMLElement) return firstBodyCell.getBoundingClientRect();

      return null;
    },
    [showSelectionColumn],
  );

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
  const rowsById = useMemo(() => new Map(allRows.map((row) => [row.id, row] as const)), [allRows]);
  const activeVisibleColumnIds = visibleColumnIds ?? new Set<string>();
  const activeActionsRowId = actionsMenu?.rowId ?? null;
  const actionsMenuRow = useMemo(
    () => (actionsMenu ? allRows.find((row) => row.id === actionsMenu.rowId) ?? null : null),
    [actionsMenu, allRows],
  );

  useEffect(() => {
    if (!actionsMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (actionsMenuRef.current?.contains(target)) return;
      setActionsMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenu(null);
    };

    globalThis.document.addEventListener("mousedown", handlePointerDown);
    globalThis.document.addEventListener("keydown", handleEscape);
    return () => {
      globalThis.document.removeEventListener("mousedown", handlePointerDown);
      globalThis.document.removeEventListener("keydown", handleEscape);
    };
  }, [actionsMenu]);

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
    const dataColumns: ColumnDef<InventoryRow>[] = dataset.columns
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

    const actionsColumn: ColumnDef<InventoryRow> = {
      id: actionsColumnId,
      header: "",
      accessorFn: () => "",
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => {
        const isRatingEffectiveDateRow = tabId === "ratings" && row.original.nodeType === "rating-effective-date";
        const isCustomActionRow = Boolean(onRowAction && (tabId !== "published" || row.original.kind === "location"));
        const isOpen = activeActionsRowId === row.original.id;
        return (
          <div className="row-actions" ref={isOpen ? actionsMenuRef : null}>
            <GwButton
              type="button"
              variant="subtle"
              className="row-actions-trigger"
              disabled={!isRatingEffectiveDateRow && !isCustomActionRow}
              aria-label={`Open actions for ${row.original.label}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={(event) => {
                if (!isRatingEffectiveDateRow && !isCustomActionRow) return;
                event.stopPropagation();
                const triggerRect = event.currentTarget.getBoundingClientRect();
                // Defer menu state update so the click handler returns quickly.
                globalThis.requestAnimationFrame(() => {
                  setActionsMenu((current) =>
                    current?.rowId === row.original.id
                      ? null
                      : {
                          rowId: row.original.id,
                          label: row.original.label,
                          x: triggerRect.right + 6,
                          y: triggerRect.bottom + 4,
                        },
                  );
                });
              }}
            >
              <MoreHorizontal size={14} />
            </GwButton>
          </div>
        );
      },
      meta: { group: "", width: 42 },
    };

    return [actionsColumn, ...dataColumns];
  }, [activeActionsRowId, activeVisibleColumnIds, childIds, dataset.columns, expanded, handleToggleExpand, loadingChildrenByParent, onRowAction, tabId]);

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

  const toSelectedEntity = useCallback(
    (row: InventoryRow): SelectedEntity | null => {
      if (row.selectable === false) return null;
      if (tabId === "time-series-groups") {
        if (row.kind !== "timeSeries") return null;
        const timeSeriesId =
          typeof row.timeSeriesId === "string" && row.timeSeriesId.trim().length > 0
            ? row.timeSeriesId
            : row.label;
        return {
          id: timeSeriesId,
          label: timeSeriesId,
          kind: "timeSeries",
          office: row.office,
          units: typeof row.units === "string" ? row.units : undefined,
          tabId,
        };
      }
      if (tabId === "location-groups") {
        if (row.nodeType !== "location-member") return null;
        const locationId =
          typeof row.location === "string" && row.location.trim().length > 0
            ? row.location
            : row.label;
        return {
          id: locationId,
          label: locationId,
          kind: "location",
          office: row.office,
          locationId,
          latitude: typeof row.latitude === "number" ? row.latitude : undefined,
          longitude: typeof row.longitude === "number" ? row.longitude : undefined,
          tabId,
        };
      }

      return {
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
      };
    },
    [tabId],
  );

  const resolveEntitiesForRow = useCallback(
    (row: InventoryRow): SelectedEntity[] => {
      const sourceRows = tabId === "location-groups"
        ? row.nodeType === "location-member"
          ? [row]
          : (descendantIdsByParent.get(row.id) ?? [])
            .map((id) => rowsById.get(id))
            .filter((candidate): candidate is InventoryRow => Boolean(candidate))
            .filter((candidate) => candidate.nodeType === "location-member")
        : tabId === "time-series-groups"
          ? row.kind === "timeSeries"
            ? [row]
            : (descendantIdsByParent.get(row.id) ?? [])
              .map((id) => rowsById.get(id))
              .filter((candidate): candidate is InventoryRow => Boolean(candidate))
              .filter((candidate) => candidate.kind === "timeSeries")
          : [row];

      const deduped = new Map<string, SelectedEntity>();
      for (const sourceRow of sourceRows) {
        const entity = toSelectedEntity(sourceRow);
        if (!entity) continue;
        deduped.set(`${entity.kind}-${entity.id}`, entity);
      }
      return [...deduped.values()];
    },
    [descendantIdsByParent, rowsById, tabId, toSelectedEntity],
  );

  const selectedEntities = useMemo(() => {
    const deduped = new Map<string, SelectedEntity>();
    for (const row of allRows) {
      if (!selectedRows[row.id]) continue;
      for (const entity of resolveEntitiesForRow(row)) {
        deduped.set(`${entity.kind}-${entity.id}`, entity);
      }
    }
    return [...deduped.values()];
  }, [allRows, resolveEntitiesForRow, selectedRows]);

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
            <GwButton
              type="button"
              onClick={(event) => {
                onAddSelections(selectedEntities);
                if (!selectedEntities.length) return;
                const originRect = getSelectionColumnOriginRect() ?? event.currentTarget.getBoundingClientRect();
                emitSelectionFlight(originRect, selectedEntities.length);
              }}
              disabled={!selectedEntities.length}
            >
              Select
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
                <th aria-label="actions column" />
                {showSelectionColumn && <th aria-label="select column" />}
                {groupedHeaders.map((group, index) => (
                  <th key={`${group.group}-${index}`} colSpan={group.span}>{group.group}</th>
                ))}
              </tr>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => (
                    <Fragment key={`header-${header.id}`}>
                      <th key={header.id} style={{ minWidth: `${(header.column.columnDef.meta as { width?: number } | undefined)?.width ?? 120}px` }}>
                        {header.column.id === actionsColumnId ? (
                          <div className="actions-header-spacer" aria-hidden="true" />
                        ) : (
                          <>
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
                          </>
                        )}
                      </th>
                      {showSelectionColumn && index === 0 && <th className="select-col" />}
                    </Fragment>
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
                    style={{ height: `${virtualItem.size}px` }}
                    onDoubleClick={(event) => {
                      const target = event.target;
                      if (!(target instanceof Element)) return;
                      if (target.closest("button, input, label, [role='menu']")) return;

                      const entities = resolveEntitiesForRow(row.original);
                      if (!entities.length) return;
                      onAddSelections(entities);
                      const originRect = getSelectionColumnOriginRect(event.currentTarget) ?? event.currentTarget.getBoundingClientRect();
                      emitSelectionFlight(originRect, entities.length);
                    }}
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <Fragment key={`cell-${cell.id}`}>
                        <td className={cell.column.id === actionsColumnId ? "actions-cell" : undefined}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                        {showSelectionColumn && index === 0 && (
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
                      </Fragment>
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
      {actionsMenu && (
        <div
          className="row-actions-menu"
          ref={actionsMenuRef}
          role="menu"
          aria-label={`Actions for ${actionsMenu.label}`}
          style={{ left: `${actionsMenu.x}px`, top: `${actionsMenu.y}px` }}
        >
          <button
            type="button"
            role="menuitem"
            className="row-actions-item"
            disabled={!(tabId === "ratings" && actionsMenuRow?.nodeType === "rating-effective-date")}
            onClick={() => {
              if (!(tabId === "ratings" && actionsMenuRow?.nodeType === "rating-effective-date")) return;
              setRatingEditorRow(actionsMenuRow);
              setActionsMenu(null);
            }}
          >
            Edit Effective Date
          </button>
          {onRowAction && rowActionLabel && (
            <button
              type="button"
              role="menuitem"
              className="row-actions-item"
              disabled={tabId === "published" && actionsMenuRow?.kind !== "location"}
              onClick={() => {
                if (actionsMenuRow) {
                  onRowAction(actionsMenuRow);
                }
                setActionsMenu(null);
              }}
            >
              {rowActionLabel}
            </button>
          )}
        </div>
      )}
      <RatingEffectiveDateEditor open={Boolean(ratingEditorRow)} row={ratingEditorRow} onClose={() => setRatingEditorRow(null)} />
    </section>
  );
}
