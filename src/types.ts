export type TabId =
  | "time-series"
  | "ratings"
  | "levels"
  | "location-groups"
  | "time-series-groups"
  | "clobs"
  | "locations"
  | "measurements";

export type EntityKind =
  | "timeSeries"
  | "rating"
  | "level"
  | "locationGroup"
  | "timeSeriesGroup"
  | "clob"
  | "location"
  | "measurement";

export type TimeWindowMode = "none" | "specific" | "relative" | "waterYear";

export interface TimeWindow {
  mode: TimeWindowMode;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  goBack: number;
  goBackUnit: "hours" | "days" | "months" | "years";
  goForward: number;
  goForwardUnit: "hours" | "days" | "months" | "years";
  waterYearStart: string;
  retainBetweenSessions: boolean;
}

export interface AppSettings {
  baseUrl: string;
  office: string;
  user: string;
  timezone: string;
  unitSystem: "English" | "SI";
  timeWindow: TimeWindow;
  authStatus?: string;
  authDetail?: string;
}

export interface CdaDataSource {
  label: string;
  environment: "Test" | "Prod" | "Dev";
  baseUrl: string;
}

export interface CdaOffice {
  id: string;
  name?: string;
}

export interface SelectedEntity {
  id: string;
  label: string;
  kind: EntityKind;
  office?: string;
  units?: string;
  locationId?: string;
  latitude?: number;
  longitude?: number;
  tabId: TabId;
}

export interface AliasMap {
  [aliasName: string]: string | number | undefined;
}

export interface InventoryRow {
  id: string;
  kind: EntityKind;
  label: string;
  office?: string;
  parentId?: string;
  depth?: number;
  selectable?: boolean;
  aliases?: AliasMap;
  [key: string]: unknown;
}

export interface ColumnDefConfig {
  id: string;
  header: string;
  accessorKey: string;
  group: string;
  width?: number;
  defaultVisible?: boolean;
  pinned?: boolean;
}

export interface InventoryDataset {
  rows: InventoryRow[];
  columns: ColumnDefConfig[];
  pageInfo?: InventoryPageInfo;
}

export interface InventoryPageInfo {
  pagesLoaded: number;
  totalRows: number;
  pageSize: number;
  exhausted: boolean;
  partial: boolean;
  errorPage?: number;
  warning?: string;
}

export interface PlotPoint {
  date: string;
  [seriesName: string]: string | number;
}
