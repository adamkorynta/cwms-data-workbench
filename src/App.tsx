import { Plus } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  configureCdaClient,
  extractCdaAccessTokenFromUrl,
  getCdaConfig,
  loadCdaAccessTokenFromSession,
  setCdaAccessToken,
  setCdaApiKey,
} from "./api/cdaClient";
import { PublishedPage } from "./components/PublishedPage";
import { PublishedAssignmentDialog } from "./components/PublishedAssignmentDialog";
import { 
  fetchPublishedLocations, 
  fetchTimeSeriesByLocation,
  PublishedTimeSeriesAssignment
} from "./services/publishedService";
import { AuthMethodDialog } from "./components/AuthMethodDialog";
import { AppShell } from "./components/AppShell";
import { FooterStatus } from "./components/FooterStatus";
import { GwButton } from "./components/GroundworkControls";
import { InventoryGrid } from "./components/InventoryGrid";
import { SelectionTray } from "./components/SelectionTray";
import { Tabs, type TabDefinition } from "./components/Tabs";
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
import { beginOidcLogin, completeOidcLoginFromUrl, fetchOidcBootstrapConfig } from "./services/oidcService";
import { fetchOffices } from "./services/officesService";
import { fetchUserProfile } from "./services/userProfileService";
import type { AppSettings, CdaOffice, InventoryDataset, InventoryRow, SelectedEntity, TabId } from "./types";
import { loadPreferences, savePreferences } from "./utils/preferences";
import { defaultTimeWindow } from "./utils/timeWindow";

type PlotWorkspaceMode = "chart" | "table" | "map";
type AuthMode = "none" | "oidc" | "apikey";
const oidcLoginPendingKey = "cwms-oidc-login-pending";

const tabs: TabDefinition[] = [
  { id: "time-series", label: "Time Series" },
  { id: "ratings", label: "Ratings" },
  { id: "levels", label: "Location Levels", disabled: true },
  { id: "location-groups", label: "Location Groups" },
  { id: "time-series-groups", label: "Time Series Groups" },
  { id: "locations", label: "Locations" },
  { id: "published", label: "Published Timeseries" },
  { id: "measurements", label: "Measurements", disabled: true },
];

const loaders: Record<TabId, () => Promise<InventoryDataset>> = {
  "time-series": fetchTimeSeriesInventory,
  ratings: fetchRatingsInventory,
  levels: fetchLevelsInventory,
  "location-groups": fetchLocationGroupsInventory,
  "time-series-groups": fetchTimeSeriesGroupsInventory,
  locations: fetchLocationsInventory,
  published: fetchPublishedLocations,
  measurements: fetchMeasurementsInventory,
};

const userProfileTimeoutMs = 15000;

const PlotWorkspace = lazy(async () => {
  const module = await import("./components/PlotWorkspace");
  return { default: module.PlotWorkspace };
});

const TimeSeriesEditor = lazy(async () => {
  const module = await import("./components/TimeSeriesEditor");
  return { default: module.TimeSeriesEditor };
});

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("time-series");
  const preferences = useMemo(loadPreferences, []);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [authDialogError, setAuthDialogError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    baseUrl: preferences.baseUrl,
    office: preferences.office,
    user: "Not signed in",
    timezone: "Local Time PST",
    unitSystem: "English",
    timeWindow: defaultTimeWindow,
    authStatus: undefined,
    authDetail: undefined,
  });
  const [offices, setOffices] = useState<CdaOffice[]>([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [officesError, setOfficesError] = useState<string | null>(null);
  const [selections, setSelections] = useState<SelectedEntity[]>([]);
  const [timeWindowOpen, setTimeWindowOpen] = useState(false);
  const [plotOpen, setPlotOpen] = useState(false);
  const [plotInitialMode, setPlotInitialMode] = useState<PlotWorkspaceMode>("chart");
  const [editorOpen, setEditorOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);

  const hydrateUserFromCda = useCallback(
    async (baseUrl: string, signal?: AbortSignal) => {
      setSettings((current) => ({
        ...current,
        authStatus: "Checking /user/profile...",
        authDetail: undefined,
      }));
      const profile = await fetchUserProfile(baseUrl, signal);
      const displayName = profile.email ?? profile.username;
      let authDetail: string | undefined;
      if (profile.principal) {
        authDetail = `principal: ${profile.principal}`;
        if (profile.cacAuth !== undefined) {
          authDetail += profile.cacAuth ? ", CAC: yes" : ", CAC: no";
        }
      } else if (profile.cacAuth !== undefined) {
        authDetail = `CAC: ${profile.cacAuth ? "yes" : "no"}`;
      }

      setSettings((current) => ({
        ...current,
        user: displayName,
        authStatus: `Logged in as ${displayName}`,
        authDetail,
      }));

      if (globalThis.sessionStorage.getItem(oidcLoginPendingKey) === "1") {
        globalThis.sessionStorage.removeItem(oidcLoginPendingKey);
        globalThis.alert(`Login confirmed for ${displayName}.`);
      }
    },
    [],
  );

  useEffect(() => {
    loadCdaAccessTokenFromSession();
    const controller = new AbortController();
    let cancelled = false;

    const resolveOidcCallback = async () => {
      const existingApiKey = getCdaConfig().apiKey;
      if (existingApiKey) {
        setAuthMode("apikey");
        setAuthError(null);
        setAuthReady(true);
        setSettings((current) => ({
          ...current,
          user: "API key session",
          authStatus: "Authenticated with API key",
          authDetail: `key length: ${existingApiKey.length}`,
        }));
        return;
      }

      const extractedToken = extractCdaAccessTokenFromUrl();
      if (extractedToken) {
        setAuthMode("oidc");
        setSettings((current) => ({
          ...current,
          authStatus: "JWT captured from login callback",
          authDetail: `token length: ${extractedToken.length}`,
        }));
        setAuthError(null);
        setAuthReady(true);
        return;
      }

      const completion = await completeOidcLoginFromUrl(settings.baseUrl, controller.signal);
      if (cancelled) return;

      if (completion?.status === "error") {
        const message = completion.errorDescription ?? completion.error ?? "OIDC login failed.";
        setAuthMode("none");
        setAuthError(message);
        setAuthReady(false);
        setSettings((current) => ({
          ...current,
          user: "Not signed in",
          authStatus: `OIDC login error: ${completion.error ?? "unknown"}`,
          authDetail: message,
        }));
        return;
      }

      if (completion?.status === "success") {
        setAuthMode("oidc");
        setAuthError(null);
        setSettings((current) => ({
          ...current,
          authStatus: "JWT captured from authorization code exchange",
          authDetail: `token length: ${completion.accessToken?.length ?? 0}`,
        }));
      }

      setAuthReady(true);
    };

    resolveOidcCallback().catch((error_: unknown) => {
      if (!cancelled) {
        setAuthError(error_ instanceof Error ? error_.message : "Unable to complete OIDC login.");
        setAuthReady(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setOfficesLoading(true);
    setOfficesError(null);

    fetchOffices(settings.baseUrl, controller.signal)
      .then((nextOffices) => {
        setOffices(nextOffices);
        if (nextOffices.length === 0) return;
        if (nextOffices.some((office) => office.id === settings.office)) return;

        const nextOffice = nextOffices[0].id;
        savePreferences({ office: nextOffice });
        setSettings((current) => ({ ...current, office: nextOffice }));
      })
      .catch((error_: unknown) => {
        if (!controller.signal.aborted) {
          setOffices([]);
          setOfficesError(error_ instanceof Error ? error_.message : "Unable to load offices.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOfficesLoading(false);
      });

    return () => controller.abort();
  }, [settings.baseUrl]);

  useEffect(() => {
    if (!authReady || authError || authMode !== "oidc") return;

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), userProfileTimeoutMs);

    hydrateUserFromCda(settings.baseUrl, controller.signal).catch((error_: unknown) => {
      if (controller.signal.aborted) {
        setSettings((current) => ({
          ...current,
          user: "Not signed in",
          authStatus: "Profile check timed out",
          authDetail: `No /user/profile response within ${Math.round(userProfileTimeoutMs / 1000)} seconds.`,
        }));
      } else {
        const message = error_ instanceof Error ? error_.message : "Unable to confirm login from /user/profile.";
        setSettings((current) => ({
          ...current,
          user: "Not signed in",
          authStatus: "Profile check failed",
          authDetail: message,
        }));
      }

      if (globalThis.sessionStorage.getItem(oidcLoginPendingKey) === "1") {
        globalThis.sessionStorage.removeItem(oidcLoginPendingKey);
        globalThis.alert("Login could not be confirmed from /user/profile.");
      }
    }).finally(() => {
      globalThis.clearTimeout(timeoutId);
    });

    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [authMode, authReady, authError, hydrateUserFromCda, settings.baseUrl]);

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
    setCdaAccessToken(undefined);
    setCdaApiKey(undefined);
    setSelections([]);
    setAuthReady(false);
    setAuthError(null);
    setAuthMode("none");
    setSettings((current) => ({ ...current, baseUrl: normalized, user: "Not signed in", authStatus: undefined, authDetail: undefined }));
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

  const handleIdpLogin = async () => {
    setAuthBusy(true);
    setAuthDialogError(null);
    try {
      setSettings((current) => ({
        ...current,
        authStatus: "Redirecting to OIDC login...",
        authDetail: undefined,
      }));
      const oidc = await fetchOidcBootstrapConfig(settings.baseUrl);
      const authorizeUrl = await beginOidcLogin(oidc, globalThis.location.origin + globalThis.location.pathname);
      globalThis.sessionStorage.setItem(oidcLoginPendingKey, "1");
      setAuthDialogOpen(false);
      globalThis.location.assign(authorizeUrl);
    } catch {
      setSettings((current) => ({
        ...current,
        authStatus: "Login bootstrap failed",
        authDetail: "Could not load OpenIDConnect metadata from CDA.",
      }));
      setAuthDialogError("Could not load OpenIDConnect metadata from CDA for this host.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleApiKeyLogin = () => {
    const normalizedApiKey = apiKeyDraft.trim();
    if (!normalizedApiKey) {
      setAuthDialogError("Provide an API key before continuing.");
      return;
    }

    setCdaAccessToken(undefined);
    setCdaApiKey(normalizedApiKey);
    setAuthMode("apikey");
    setAuthError(null);
    setAuthReady(true);
    setAuthDialogOpen(false);
    setApiKeyDraft("");
    setAuthDialogError(null);
    setSettings((current) => ({
      ...current,
      user: "API key session",
      authStatus: "Authenticated with API key",
      authDetail: `key length: ${normalizedApiKey.length}`,
    }));
  };

  const handleLogin = () => {
    setAuthDialogError(null);
    setApiKeyDraft("");
    setAuthDialogOpen(true);
  };

  const handleLogout = () => {
    setCdaAccessToken(undefined);
    setCdaApiKey(undefined);
    setAuthReady(false);
    setAuthError(null);
    setAuthMode("none");
    setSettings((current) => ({ ...current, user: "Not signed in", authStatus: "Signed out", authDetail: undefined }));
  };

  const handleLoadChildren = useCallback(async (row: InventoryRow): Promise<InventoryRow[]> => {
    if (activeTab === "locations") {
      if (row.kind === "location") {
        // Return intermediate "Published Time Series" row
        return [
          {
            id: `published-ts-root:${row.id}`,
            kind: "timeSeries", // Using timeSeries kind so it's treated similarly for display/grouping if needed
            label: "Published Time Series",
            location: "Published Time Series",
            locationId: row.locationId,
            parentId: row.id,
            hasChildren: true,
            selectable: false,
            depth: (row.depth ?? 0) + 1,
          },
        ];
      }

      if (row.id.startsWith("published-ts-root:")) {
        const locationId = row.locationId as string;
        const assignments = await fetchTimeSeriesByLocation(locationId);

        // Group by parameter
        const groups: Record<string, PublishedTimeSeriesAssignment[]> = {};
        assignments.forEach((assignment) => {
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
              location: parameter, // Show parameter in the Location column
              locationId: parameter,
              timeSeriesId: firstAssignment?.timeSeriesId || "",
              publicName: "", // Clear location-based public name for sub-records
              longName: "", // Clear location-based long name for sub-records
              parentId: row.id,
              hasChildren: false,
              selectable: true,
              depth: (row.depth ?? 0) + 1,
              parameter: parameter,
            };
          });
      }
    }
    return [];
  }, [activeTab]);

  return (
    <AppShell
      settings={settings}
      offices={offices}
      officesLoading={officesLoading}
      officesError={officesError}
      onDataSourceChange={handleDataSourceChange}
      onOfficeChange={handleOfficeChange}
      onLogin={handleLogin}
      onLogout={handleLogout}
    >
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      <main className="main-workbench">
        {activeTab === "published" ? (
          <PublishedPage />
        ) : (
          <InventoryGrid
            key={activeTab}
            tabId={activeTab}
            title={title}
            dataset={inventory.dataset}
            loading={inventory.loading}
            error={inventory.error}
            onRetry={inventory.reload}
            onAddSelections={addSelections}
            onLoadChildren={handleLoadChildren}
            onRowAction={activeTab === "locations" ? (row) => {
              if (row.kind === "location") {
                setSelectedLocationId(row.locationId as string || row.id);
                setIsAssignmentDialogOpen(true);
              }
            } : undefined}
            rowActionLabel={activeTab === "locations" ? "Assign Time Series" : undefined}
            toolbar={
              activeTab === "time-series" ? (
                <GwButton type="button" variant="primary" onClick={() => setEditorOpen(true)}>
                  <Plus size={14} />
                  New Time Series
                </GwButton>
              ) : null
            }
          />
        )}
      </main>
      <SelectionTray
        selections={selections}
        onRemove={(id) => setSelections((current) => current.filter((item) => item.id !== id))}
        onClear={() => setSelections([])}
        onOpenPlot={() => handleOpenPlotWorkspace("chart")}
        onOpenTable={() => handleOpenPlotWorkspace("table")}
        onOpenMap={() => handleOpenPlotWorkspace("map")}
      />
      <FooterStatus settings={settings} onOpenTimeWindow={() => setTimeWindowOpen(true)} />
      <TimeWindowDialog
        open={timeWindowOpen}
        value={settings.timeWindow}
        onChange={(timeWindow) => setSettings((current) => ({ ...current, timeWindow }))}
        onClose={() => setTimeWindowOpen(false)}
      />
      {plotOpen ? (
        <Suspense fallback={null}>
          <PlotWorkspace
            open={plotOpen}
            initialMode={plotInitialMode}
            selections={selections}
            timeWindow={settings.timeWindow}
            timezone={settings.timezone}
            onClose={() => setPlotOpen(false)}
          />
        </Suspense>
      ) : null}
      {editorOpen ? (
        <Suspense fallback={null}>
          <TimeSeriesEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
        </Suspense>
      ) : null}
      <PublishedAssignmentDialog 
        open={isAssignmentDialogOpen} 
        onClose={() => setIsAssignmentDialogOpen(false)} 
        initialLocationId={selectedLocationId}
      />
      <AuthMethodDialog
        open={authDialogOpen}
        apiKey={apiKeyDraft}
        busy={authBusy}
        error={authDialogError}
        onApiKeyChange={setApiKeyDraft}
        onUseApiKey={handleApiKeyLogin}
        onUseIdp={handleIdpLogin}
        onClose={() => {
          if (authBusy) return;
          setAuthDialogOpen(false);
          setAuthDialogError(null);
        }}
      />
    </AppShell>
  );
}
