import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { configureCdaClient } from "./api/cdaClient";
import { AppShell } from "./components/AppShell";
import { FooterStatus } from "./components/FooterStatus";
import { GwButton } from "./components/GroundworkControls";
import { InventoryGrid } from "./components/InventoryGrid";
import { PlotWorkspace } from "./components/PlotWorkspace";
import { SelectionTray } from "./components/SelectionTray";
import { Tabs, type TabDefinition } from "./components/Tabs";
import { TimeSeriesEditor } from "./components/TimeSeriesEditor";
import { TimeWindowDialog } from "./components/TimeWindowDialog";
import { normalizeBaseUrl } from "./config/dataSources";
import { useInventory } from "./hooks/useInventory";
import {
  fetchLevelsInventory,
  fetchLocationGroupsInventory,
  fetchLocationsInventory,
  fetchMeasurementsInventory,
  fetchRatingsInventory,
  fetchTimeSeriesGroupsInventory,
  fetchTimeSeriesInventory,
} from "./services/inventoryServices";
import { fetchOffices } from "./services/officesService";
import type { AppSettings, CdaOffice, InventoryDataset, SelectedEntity, TabId } from "./types";
import { loadPreferences, savePreferences } from "./utils/preferences";
import { defaultTimeWindow } from "./utils/timeWindow";

type PlotWorkspaceMode = "chart" | "table";

const tabs: TabDefinition[] = [
  { id: "time-series", label: "Time Series" },
  { id: "ratings", label: "Ratings" },
  { id: "levels", label: "Location Levels", disabled: true },
  { id: "location-groups", label: "Location Groups" },
  { id: "time-series-groups", label: "Time Series Groups" },
  { id: "locations", label: "Locations" },
  { id: "measurements", label: "Measurements", disabled: true },
];

const loaders: Record<TabId, () => Promise<InventoryDataset>> = {
  "time-series": fetchTimeSeriesInventory,
  ratings: fetchRatingsInventory,
  levels: fetchLevelsInventory,
  "location-groups": fetchLocationGroupsInventory,
  "time-series-groups": fetchTimeSeriesGroupsInventory,
  locations: fetchLocationsInventory,
  measurements: fetchMeasurementsInventory,
};

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("time-series");
  const preferences = useMemo(loadPreferences, []);
  const [settings, setSettings] = useState<AppSettings>({
    baseUrl: preferences.baseUrl,
    office: preferences.office,
    user: "Not signed in",
    timezone: "Local Time PST",
    unitSystem: "English",
    timeWindow: defaultTimeWindow,
  });
  const [offices, setOffices] = useState<CdaOffice[]>([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [officesError, setOfficesError] = useState<string | null>(null);
  const [selections, setSelections] = useState<SelectedEntity[]>([]);
  const [timeWindowOpen, setTimeWindowOpen] = useState(false);
  const [plotOpen, setPlotOpen] = useState(false);
  const [plotInitialMode, setPlotInitialMode] = useState<PlotWorkspaceMode>("chart");
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setOfficesLoading(true);
    setOfficesError(null);

    fetchOffices(settings.baseUrl, controller.signal)
      .then((nextOffices) => {
        setOffices(nextOffices);
        if (nextOffices.length > 0) {
          setSettings((current) => {
            if (nextOffices.some((office) => office.id === current.office)) return current;
            const nextOffice = nextOffices[0].id;
            savePreferences({ office: nextOffice });
            return { ...current, office: nextOffice };
          });
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setOffices([]);
          setOfficesError(caught instanceof Error ? caught.message : "Unable to load offices.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOfficesLoading(false);
      });

    return () => controller.abort();
  }, [settings.baseUrl]);

  const loader = useCallback(() => {
    configureCdaClient({ baseUrl: settings.baseUrl, office: settings.office, timezone: settings.timezone });
    return loaders[activeTab]();
  }, [activeTab, settings.baseUrl, settings.office, settings.timezone]);
  const inventory = useInventory(loader);

  const addSelections = (entities: SelectedEntity[]) => {
    setSelections((current) => {
      const existing = new Set(current.map((item) => `${item.kind}-${item.id}`));
      return [...current, ...entities.filter((item) => !existing.has(`${item.kind}-${item.id}`))];
    });
  };

  const title = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label ?? "Inventory", [activeTab]);

  const handleDataSourceChange = (baseUrl: string) => {
    const normalized = normalizeBaseUrl(baseUrl);
    setSelections([]);
    setSettings((current) => ({ ...current, baseUrl: normalized }));
    savePreferences({ baseUrl: normalized });
  };

  const handleOfficeChange = (office: string) => {
    setSelections([]);
    setSettings((current) => ({ ...current, office }));
    savePreferences({ office });
  };

  const handleOpenPlotWorkspace = (mode: PlotWorkspaceMode) => {
    setPlotInitialMode(mode);
    setPlotOpen(true);
  };

  return (
    <AppShell
      settings={settings}
      offices={offices}
      officesLoading={officesLoading}
      officesError={officesError}
      onDataSourceChange={handleDataSourceChange}
      onOfficeChange={handleOfficeChange}
    >
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-workbench">
        <InventoryGrid
          key={activeTab}
          tabId={activeTab}
          title={title}
          dataset={inventory.dataset}
          loading={inventory.loading}
          error={inventory.error}
          onRetry={inventory.reload}
          onAddSelections={addSelections}
          toolbar={
            activeTab === "time-series" ? (
              <GwButton type="button" variant="primary" onClick={() => setEditorOpen(true)}>
                <Plus size={14} />
                New Time Series
              </GwButton>
            ) : null
          }
        />
      </main>
      <SelectionTray
        selections={selections}
        onRemove={(id) => setSelections((current) => current.filter((item) => item.id !== id))}
        onClear={() => setSelections([])}
        onOpenPlot={() => handleOpenPlotWorkspace("chart")}
        onOpenTable={() => handleOpenPlotWorkspace("table")}
      />
      <FooterStatus settings={settings} onOpenTimeWindow={() => setTimeWindowOpen(true)} />
      <TimeWindowDialog
        open={timeWindowOpen}
        value={settings.timeWindow}
        onChange={(timeWindow) => setSettings((current) => ({ ...current, timeWindow }))}
        onClose={() => setTimeWindowOpen(false)}
      />
      <PlotWorkspace
        open={plotOpen}
        initialMode={plotInitialMode}
        selections={selections}
        timeWindow={settings.timeWindow}
        timezone={settings.timezone}
        onClose={() => setPlotOpen(false)}
      />
      <TimeSeriesEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    </AppShell>
  );
}
