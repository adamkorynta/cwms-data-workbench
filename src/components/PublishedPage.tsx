import { useState, useCallback } from "react";
import { 
  fetchPublishedLocations, 
  fetchTimeSeriesByLocation, 
  type PublishedTimeSeriesAssignment 
} from "../services/publishedService";
import { useInventory } from "../hooks/useInventory";
import { InventoryGrid } from "./InventoryGrid";
import { PublishedAssignmentDialog } from "./PublishedAssignmentDialog";
import type { InventoryRow, SelectedEntity } from "../types";

export function PublishedPage() {
  const { dataset, loading, error, reload } = useInventory(fetchPublishedLocations);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  const onLoadChildren = useCallback(async (row: InventoryRow): Promise<InventoryRow[]> => {
    if (row.kind === "location") {
      const locationId = row.locationId as string;
      const assignments = await fetchTimeSeriesByLocation(locationId);
      
      // Group by parameter
      const groups: Record<string, PublishedTimeSeriesAssignment[]> = {};
      assignments.forEach(assignment => {
        const p = assignment.parameter || "Unknown";
        if (!groups[p]) groups[p] = [];
        groups[p].push(assignment);
      });

      return Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([parameter, parameterAssignments]) => {
          const firstAssignment = parameterAssignments[0];
          return {
            ...firstAssignment,
            id: `parameter:${locationId}:${parameter}`,
            kind: "timeSeries",
            label: parameter,
            locationId: parameter, // Move parameter name to the Location column
            timeSeriesId: firstAssignment?.timeSeriesId || "",
            publicName: "", // Clear location-based public name for sub-records
            longName: "",   // Clear location-based long name for sub-records
            parentId: row.id,
            hasChildren: false,
            selectable: true,
            depth: 1,
            parameter: parameter,
          };
        });
    }

    return [];
  }, []);

  const handleAddSelections = useCallback((entities: SelectedEntity[]) => {
    console.log("Adding selections:", entities);
  }, []);

  const handleRowAction = useCallback((row: InventoryRow) => {
    if (row.kind === "location") {
      setSelectedLocationId(row.locationId as string);
      setIsAssignmentDialogOpen(true);
    }
  }, []);

  return (
    <div className="published-page" style={{ height: "100%", overflow: "hidden" }}>
      <InventoryGrid
        tabId="published"
        title="Published Timeseries"
        dataset={dataset}
        loading={loading}
        error={error}
        onRetry={reload}
        onAddSelections={handleAddSelections}
        onLoadChildren={onLoadChildren}
        onRowAction={handleRowAction}
        rowActionLabel="Assign Time Series"
      />
      <PublishedAssignmentDialog 
        open={isAssignmentDialogOpen} 
        onClose={() => setIsAssignmentDialogOpen(false)} 
        initialLocationId={selectedLocationId}
      />
    </div>
  );
}
