import type { ColumnDefConfig, InventoryDataset, InventoryRow, PlotPoint } from "../types";

export const aliasColumns = [
  "USGS GNIS ID",
  "NWS Handbook 5 ID",
  "USBR Station ID",
  "NRCS Station ID",
  "CBT Station ID",
  "USGS Station Number",
  "SHEF Location ID",
  "NIDID",
  "DCP Platform ID",
  "USGS Station Name",
  "LRD",
];

const aliasDefaults = {
  "USGS GNIS ID": "1458321",
  "NWS Handbook 5 ID": "AARK2",
  "USBR Station ID": "USB-014",
  "NRCS Station ID": "NRCS-77",
  "CBT Station ID": "CBT-AARK",
  "USGS Station Number": "07165500",
  "SHEF Location ID": "AARK2",
  NIDID: "OK10309",
  "DCP Platform ID": "DCP-9812",
  "USGS Station Name": "Arkansas River",
  LRD: "LRD-AARK",
};

const aliasColumnDefs = (group = "Agency Aliases"): ColumnDefConfig[] =>
  aliasColumns.map((alias) => ({
    id: `alias-${alias}`,
    header: alias,
    accessorKey: `aliases.${alias}`,
    group,
    defaultVisible: alias === "CBT Station ID" || alias === "USGS Station Number",
  }));

export const timeSeriesDataset: InventoryDataset = {
  columns: [
    { id: "number", header: "#", accessorKey: "number", group: "Identification", width: 64, defaultVisible: true, pinned: true },
    { id: "timeSeriesId", header: "Time Series Id", accessorKey: "timeSeriesId", group: "Identification", width: 320, defaultVisible: true, pinned: true },
    { id: "office", header: "Office", accessorKey: "office", group: "Identification", defaultVisible: true },
    { id: "location", header: "Location", accessorKey: "location", group: "Identification", defaultVisible: true },
    { id: "parameter", header: "Parameter", accessorKey: "parameter", group: "Identification", defaultVisible: true },
    { id: "type", header: "Type", accessorKey: "type", group: "Identification", defaultVisible: true },
    { id: "interval", header: "Interval", accessorKey: "interval", group: "Identification", defaultVisible: true },
    { id: "duration", header: "Duration", accessorKey: "duration", group: "Identification", defaultVisible: true },
    { id: "version", header: "Version", accessorKey: "version", group: "Identification", defaultVisible: true },
    { id: "intervalOffset", header: "Interval Offset", accessorKey: "intervalOffset", group: "Identification", defaultVisible: true },
    { id: "timezone", header: "Time Zone", accessorKey: "timezone", group: "Identification", defaultVisible: true },
    { id: "longName", header: "Long Name", accessorKey: "longName", group: "Identification", defaultVisible: true },
    { id: "publicName", header: "Public Name", accessorKey: "publicName", group: "Identification", defaultVisible: false },
    { id: "dataEntryDate", header: "Data Entry Date", accessorKey: "dataEntryDate", group: "Time Range", defaultVisible: true },
    { id: "first", header: "First", accessorKey: "first", group: "Time Range", defaultVisible: true },
    { id: "last", header: "Last", accessorKey: "last", group: "Time Range", defaultVisible: true },
    { id: "eccc", header: "ECCC TS Acquisition", accessorKey: "eccc", group: "Data Acquisition", defaultVisible: false },
    { id: "shef", header: "SHEF Data Acquisition", accessorKey: "shef", group: "Data Acquisition", defaultVisible: false },
    { id: "latitude", header: "Latitude", accessorKey: "latitude", group: "Geography", defaultVisible: false },
    { id: "longitude", header: "Longitude", accessorKey: "longitude", group: "Geography", defaultVisible: false },
    ...aliasColumnDefs(),
  ],
  rows: Array.from({ length: 48 }, (_, index): InventoryRow => {
    const locations = ["AARK", "ADDI", "ALBE", "ALBT", "BIRC", "BROK", "CANT", "CHEN"];
    const params = ["Stage", "Flow", "Precip", "Temp-Water", "Volt"];
    const location = locations[index % locations.length];
    const parameter = params[index % params.length];
    const interval = index % 3 === 0 ? "1Hour" : "15Minutes";
    const version = index % 4 === 0 ? "Production" : "Decodes-raw";
    const timeSeriesId = `${location}.${parameter}.Inst.${interval}.0.${version}`;
    return {
      id: timeSeriesId,
      kind: "timeSeries",
      label: timeSeriesId,
      number: index + 1,
      timeSeriesId,
      office: "SWT",
      location,
      parameter,
      type: "Inst",
      interval,
      duration: 0,
      version,
      intervalOffset: "0s",
      timezone: "UTC",
      longName: `${location} ${parameter}`,
      publicName: `${location} ${parameter}`,
      dataEntryDate: `2026-05-${String((index % 18) + 1).padStart(2, "0")} 23:32`,
      first: "2024-05-08 19:00",
      last: "2024-11-04 06:00",
      latitude: 34 + index / 100,
      longitude: -96 - index / 100,
      aliases: { ...aliasDefaults, "CBT Station ID": `${location}-CBT`, "USGS Station Number": `07165${String(index).padStart(3, "0")}` },
    };
  }),
};

export const ratingsDataset: InventoryDataset = {
  columns: [
    { id: "ratingCurve", header: "Rating Curve", accessorKey: "ratingCurve", group: "Identification", width: 420, defaultVisible: true, pinned: true },
    { id: "location", header: "Location", accessorKey: "location", group: "Identification", defaultVisible: true },
    { id: "longName", header: "Long Name", accessorKey: "longName", group: "Identification", defaultVisible: true },
    { id: "publicName", header: "Public Name", accessorKey: "publicName", group: "Identification", defaultVisible: true },
    { id: "independent", header: "Independent", accessorKey: "independent", group: "Identification", defaultVisible: true },
    { id: "dependent", header: "Dependent", accessorKey: "dependent", group: "Identification", defaultVisible: true },
    { id: "version", header: "Version", accessorKey: "version", group: "Identification", defaultVisible: true },
    { id: "description", header: "Description", accessorKey: "description", group: "Identification", defaultVisible: true },
    { id: "active", header: "Active", accessorKey: "active", group: "Identification", defaultVisible: true },
    { id: "sourceAgency", header: "Source Agency", accessorKey: "sourceAgency", group: "Source", defaultVisible: true },
    { id: "autoUpdate", header: "Auto Update", accessorKey: "autoUpdate", group: "Source", defaultVisible: true },
    { id: "creationDate", header: "Creation Date", accessorKey: "creationDate", group: "Source", defaultVisible: true },
    { id: "inRange", header: "In Range", accessorKey: "inRange", group: "Temporal Interpolation", defaultVisible: true },
    { id: "outLow", header: "Out of Range Low", accessorKey: "outLow", group: "Temporal Interpolation", defaultVisible: true },
    { id: "outHigh", header: "Out of Range High", accessorKey: "outHigh", group: "Temporal Interpolation", defaultVisible: true },
    { id: "ip1Name", header: "Name", accessorKey: "ip1Name", group: "Independent Parameter 1", defaultVisible: true },
    { id: "ip1InRange", header: "In Range", accessorKey: "ip1InRange", group: "Independent Parameter 1", defaultVisible: true },
    { id: "ip1OutLow", header: "Out of Range Low", accessorKey: "ip1OutLow", group: "Independent Parameter 1", defaultVisible: true },
    { id: "ip1OutHigh", header: "Out of Range High", accessorKey: "ip1OutHigh", group: "Independent Parameter 1", defaultVisible: true },
    { id: "ip1Rounding", header: "Rounding Spec", accessorKey: "ip1Rounding", group: "Independent Parameter 1", defaultVisible: true },
    { id: "ip2Name", header: "Name", accessorKey: "ip2Name", group: "Independent Parameter 2", defaultVisible: false },
    { id: "ip2InRange", header: "In Range", accessorKey: "ip2InRange", group: "Independent Parameter 2", defaultVisible: false },
    { id: "ip2OutLow", header: "Out of Range Low", accessorKey: "ip2OutLow", group: "Independent Parameter 2", defaultVisible: false },
    { id: "ip2OutHigh", header: "Out of Range High", accessorKey: "ip2OutHigh", group: "Independent Parameter 2", defaultVisible: false },
    { id: "ip2Rounding", header: "Rounding Spec", accessorKey: "ip2Rounding", group: "Independent Parameter 2", defaultVisible: false },
    { id: "ip3Name", header: "Name", accessorKey: "ip3Name", group: "Independent Parameter 3", defaultVisible: false },
    { id: "ip3InRange", header: "In Range", accessorKey: "ip3InRange", group: "Independent Parameter 3", defaultVisible: false },
    { id: "ip3OutLow", header: "Out of Range Low", accessorKey: "ip3OutLow", group: "Independent Parameter 3", defaultVisible: false },
    { id: "ip3OutHigh", header: "Out of Range High", accessorKey: "ip3OutHigh", group: "Independent Parameter 3", defaultVisible: false },
    { id: "ip3Rounding", header: "Rounding Spec", accessorKey: "ip3Rounding", group: "Independent Parameter 3", defaultVisible: false },
    { id: "ip4Name", header: "Name", accessorKey: "ip4Name", group: "Independent Parameter 4", defaultVisible: false },
    { id: "ip4InRange", header: "In Range", accessorKey: "ip4InRange", group: "Independent Parameter 4", defaultVisible: false },
    { id: "ip4OutLow", header: "Out of Range Low", accessorKey: "ip4OutLow", group: "Independent Parameter 4", defaultVisible: false },
    { id: "ip4OutHigh", header: "Out of Range High", accessorKey: "ip4OutHigh", group: "Independent Parameter 4", defaultVisible: false },
    { id: "ip4Rounding", header: "Rounding Spec", accessorKey: "ip4Rounding", group: "Independent Parameter 4", defaultVisible: false },
    { id: "ip5Name", header: "Name", accessorKey: "ip5Name", group: "Independent Parameter 5", defaultVisible: false },
    { id: "ip5InRange", header: "In Range", accessorKey: "ip5InRange", group: "Independent Parameter 5", defaultVisible: false },
    { id: "ip5OutLow", header: "Out of Range Low", accessorKey: "ip5OutLow", group: "Independent Parameter 5", defaultVisible: false },
    { id: "ip5OutHigh", header: "Out of Range High", accessorKey: "ip5OutHigh", group: "Independent Parameter 5", defaultVisible: false },
    { id: "ip5Rounding", header: "Rounding Spec", accessorKey: "ip5Rounding", group: "Independent Parameter 5", defaultVisible: false },
    ...aliasColumnDefs("Location Aliases"),
  ],
  rows: [
    { id: "template", kind: "rating", label: "Template", ratingCurve: "Template", depth: 0, selectable: false },
    { id: "specs", kind: "rating", label: "Rating Specifications", ratingCurve: "Rating Specifications", depth: 0, selectable: false },
    ...["AARK", "ADDI", "ALBE", "ALBT", "BIRC", "BROK", "CANT"].flatMap((location, index) => {
      const specId = `${location}.Stage;Flow.EXSA.PRODUCTION`;
      return [
        {
          id: specId,
          kind: "rating" as const,
          label: specId,
          parentId: "specs",
          depth: 1,
          ratingCurve: specId,
          timesUsed: 91 - index,
          location,
          longName: `${location} River`,
          publicName: `${location} River`,
          independent: "Stage",
          dependent: "Flow",
          version: "PRODUCTION",
          description: `${location} rating specification`,
          active: true,
          sourceAgency: index % 2 ? "USGS" : "SWT",
          autoUpdate: true,
          creationDate: "2024-01-17 15:00",
          inRange: "PREVIOUS",
          outLow: "NEAREST",
          outHigh: "NEAREST",
          ip1Name: "Stage",
          ip1InRange: index % 2 ? "LINEAR" : "LOGARITHMIC",
          ip1OutLow: "NEAREST",
          ip1OutHigh: "NEAREST",
          ip1Rounding: "0.01",
          aliases: { ...aliasDefaults, "CBT Station ID": `${location}-CBT` },
        },
        {
          id: `${specId}-2021`,
          kind: "rating" as const,
          label: "2021-05-29 22:00",
          parentId: specId,
          depth: 2,
          ratingCurve: "2021-05-29 22:00",
          location,
          independent: "ft",
          dependent: "cfs",
          active: true,
        },
      ];
    }),
  ],
};

export const levelsDataset: InventoryDataset = {
  columns: [
    { id: "locationLevel", header: "Location Level", accessorKey: "locationLevel", group: "Identification", width: 320, defaultVisible: true, pinned: true },
    { id: "timesUsed", header: "Times Used", accessorKey: "timesUsed", group: "Identification", defaultVisible: true },
    { id: "office", header: "Office Id", accessorKey: "office", group: "Specified Level", defaultVisible: true },
    { id: "specifiedLevelId", header: "Specified Level Id", accessorKey: "specifiedLevelId", group: "Specified Level", defaultVisible: true },
    { id: "description", header: "Description", accessorKey: "description", group: "Specified Level", defaultVisible: true },
    { id: "parameter", header: "Parameter", accessorKey: "parameter", group: "Location Level", defaultVisible: true },
    { id: "parameterType", header: "Parameter Type", accessorKey: "parameterType", group: "Location Level", defaultVisible: true },
    { id: "duration", header: "Duration", accessorKey: "duration", group: "Location Level", defaultVisible: true },
    { id: "expirationDate", header: "Expiration Date", accessorKey: "expirationDate", group: "Level Value", defaultVisible: true },
    { id: "valueType", header: "Value Type", accessorKey: "valueType", group: "Level Value", defaultVisible: true },
    { id: "units", header: "Units", accessorKey: "units", group: "Level Value", defaultVisible: true },
    { id: "interpolate", header: "Interpolate", accessorKey: "interpolate", group: "Level Value", defaultVisible: true },
    { id: "latitude", header: "Published Latitude", accessorKey: "latitude", group: "Geography", defaultVisible: true },
    ...aliasColumnDefs("Location Aliases"),
  ],
  rows: [
    { id: "specified", kind: "level", label: "Specified Levels", locationLevel: "Specified Levels", depth: 0, selectable: false },
    { id: "location-levels", kind: "level", label: "Location Levels", locationLevel: "Location Levels", depth: 0, selectable: false },
    ...["021122", "149145", "207411", "263701", "437117"].flatMap((loc, index) => {
      const id = `${loc}.Elev.Inst.0.UnitTestLevel${index}`;
      return [
        {
          id,
          kind: "level" as const,
          label: id,
          parentId: "location-levels",
          depth: 1,
          locationLevel: id,
          timesUsed: index + 1,
          office: "SWT",
          specifiedLevelId: `UnitTestLevel${index}`,
          description: index === 1 ? "Top of Dam" : "",
          parameter: "Elev",
          parameterType: "Inst",
          duration: 0,
          latitude: 38.56,
          aliases: { ...aliasDefaults },
        },
        {
          id: `${id}-2026`,
          kind: "level" as const,
          label: "2026-01-01 00:00",
          parentId: id,
          depth: 2,
          locationLevel: "2026-01-01 00:00",
          valueType: index % 2 ? "Seasonal Repeating" : "Constant",
          units: "ft",
          interpolate: false,
        },
      ];
    }),
  ],
};

export const locationGroupsDataset: InventoryDataset = {
  columns: [
    { id: "name", header: "Category/Group/Location", accessorKey: "name", group: "Location Groups", width: 260, defaultVisible: true, pinned: true },
    { id: "office", header: "Office", accessorKey: "office", group: "Location Groups", defaultVisible: true },
    { id: "description", header: "Description", accessorKey: "description", group: "Location Groups", defaultVisible: true },
    { id: "referenceLocation", header: "Reference Location", accessorKey: "referenceLocation", group: "Location Groups", defaultVisible: true },
    { id: "alias", header: "Alias", accessorKey: "alias", group: "Location Groups", defaultVisible: true },
    { id: "attribute", header: "Attribute", accessorKey: "attribute", group: "Location Groups", defaultVisible: true },
  ],
  rows: [
    { id: "Agency Aliases", kind: "locationGroup", label: "Agency Aliases", name: "Agency Aliases", office: "CWMS", description: "Location aliases for agencies", depth: 0, selectable: false },
    ...["CBT Station ID", "CWMS Legacy Naming", "DCP Platform ID", "NIDID", "USGS Station Number"].flatMap((group) => [
      { id: group, kind: "locationGroup" as const, label: group, parentId: "Agency Aliases", name: group, office: group === "NIDID" ? "CWMS" : "SWT", description: "Alias group for locations", depth: 1, selectable: false },
      ...["AARK", "ADDI", "ALBE", "ALBT"].map((loc, index) => ({
        id: `${group}-${loc}`,
        kind: "locationGroup" as const,
        label: `${group} ${loc}`,
        parentId: group,
        name: loc,
        office: "SWT",
        alias: group.includes("USGS") ? `07165${index}00` : `${loc}-${group.split(" ")[0]}`,
        attribute: index,
        depth: 2,
        selectable: false,
      })),
    ]),
  ],
};

export const timeSeriesGroupsDataset: InventoryDataset = {
  columns: [
    { id: "name", header: "Category/Group/Time Series", accessorKey: "name", group: "Time Series Groups", width: 300, defaultVisible: true, pinned: true },
    { id: "description", header: "Description", accessorKey: "description", group: "Time Series Groups", defaultVisible: true },
    { id: "referenceTimeSeries", header: "Reference Time Series", accessorKey: "referenceTimeSeries", group: "Time Series Groups", defaultVisible: true },
    { id: "alias", header: "Alias", accessorKey: "alias", group: "Time Series Groups", defaultVisible: true },
    { id: "attribute", header: "Attribute", accessorKey: "attribute", group: "Time Series Groups", defaultVisible: true },
  ],
  rows: [
    ...["Agency Aliases", "Data Acquisition", "Data Dissemination", "Default", "RDL_Aliases"].map((category) => ({
      id: category,
      kind: "timeSeriesGroup" as const,
      label: category,
      name: category,
      description: category === "Data Acquisition" ? "Groups used to manage acquisition from other organizations" : category,
      depth: 0,
      selectable: false,
    })),
    { id: "Reporting", kind: "timeSeriesGroup", label: "Reporting", parentId: "RDL_Aliases", name: "Reporting", description: "Reporting", depth: 1 },
    ...["TULA.Flow-Out.1Hour.Reporting", "AARK.Area.Inst.1Day.Local", "AARK.Elev.Inst.1Day.Local"].map((name, index) => ({
      id: name,
      kind: "timeSeriesGroup" as const,
      label: name,
      parentId: "Reporting",
      name,
      referenceTimeSeries: index === 0 ? "TULA.Flow-Out.1Hour.Reporting" : "",
      attribute: index,
      depth: 2,
    })),
  ],
};

export const locationsDataset: InventoryDataset = {
  columns: [
    { id: "location", header: "Location", accessorKey: "location", group: "Naming", width: 160, defaultVisible: true, pinned: true },
    { id: "office", header: "Office", accessorKey: "office", group: "Naming", defaultVisible: true },
    { id: "baseLocation", header: "Base Location", accessorKey: "baseLocation", group: "Naming", defaultVisible: true },
    { id: "subLocation", header: "Sub Location", accessorKey: "subLocation", group: "Naming", defaultVisible: true },
    { id: "publicName", header: "Public Name", accessorKey: "publicName", group: "Naming", defaultVisible: true },
    { id: "longName", header: "Long Name", accessorKey: "longName", group: "Naming", defaultVisible: true },
    { id: "description", header: "Description", accessorKey: "description", group: "Naming", defaultVisible: true },
    { id: "locationKind", header: "Location Kind", accessorKey: "locationKind", group: "Naming", defaultVisible: true },
    { id: "locationType", header: "Location Type", accessorKey: "locationType", group: "Naming", defaultVisible: true },
    { id: "timezone", header: "Time Zone", accessorKey: "timezone", group: "Geography", defaultVisible: true },
    { id: "latitude", header: "Latitude", accessorKey: "latitude", group: "Geography", defaultVisible: true },
    { id: "longitude", header: "Longitude", accessorKey: "longitude", group: "Geography", defaultVisible: true },
    { id: "publishedLatitude", header: "Published Latitude", accessorKey: "publishedLatitude", group: "Geography", defaultVisible: true },
    { id: "publishedLongitude", header: "Published Longitude", accessorKey: "publishedLongitude", group: "Geography", defaultVisible: true },
    { id: "horizontalDatum", header: "Horizontal Datum", accessorKey: "horizontalDatum", group: "Geography", defaultVisible: true },
    { id: "elevation", header: "Elevation", accessorKey: "elevation", group: "Geography", defaultVisible: true },
    { id: "unit", header: "Unit", accessorKey: "unit", group: "Geography", defaultVisible: true },
    { id: "verticalDatum", header: "Vertical Datum", accessorKey: "verticalDatum", group: "Geography", defaultVisible: true },
    { id: "nation", header: "Nation", accessorKey: "nation", group: "Geography", defaultVisible: true },
    { id: "state", header: "State", accessorKey: "state", group: "Geography", defaultVisible: true },
    { id: "county", header: "County", accessorKey: "county", group: "Geography", defaultVisible: true },
    { id: "nearestCity", header: "Nearest City", accessorKey: "nearestCity", group: "Geography", defaultVisible: true },
    { id: "boundingOffice", header: "Bounding Office", accessorKey: "boundingOffice", group: "Geography", defaultVisible: true },
    { id: "mapLabel", header: "Map Label", accessorKey: "mapLabel", group: "Geography", defaultVisible: true },
    { id: "active", header: "Active", accessorKey: "active", group: "Geography", defaultVisible: true },
    ...aliasColumnDefs(),
  ],
  rows: ["AARK", "SCOM", "WGKS", "SCOT", "WHET2", "EDCK1", "PBUF", "MCAO2", "GYMK1", "OPTI", "CEDA"].map((location, index) => ({
    id: location,
    kind: "location",
    label: location,
    location,
    office: "SWT",
    baseLocation: location,
    subLocation: "",
    publicName: `${location} River`,
    longName: `${location} Reservoir`,
    description: index % 5 === 0 ? "Operations location" : "",
    locationKind: index % 6 === 0 ? "BASIN" : "SITE",
    timezone: index % 4 === 0 ? "US/Central" : "CST6CDT",
    publishedLatitude: 36.2 + index / 10,
    verticalDatum: index % 3 === 0 ? "NAVD88" : "NGVD29",
    aliases: { ...aliasDefaults, "CBT Station ID": `${location}-CBT`, "USGS Station Number": `0716${index}500` },
  })),
};

export const measurementsDataset: InventoryDataset = {
  columns: [
    { id: "location", header: "Location", accessorKey: "location", group: "Identification", width: 160, defaultVisible: true, pinned: true },
    { id: "first", header: "First", accessorKey: "first", group: "Identification", defaultVisible: true },
    { id: "last", header: "Last", accessorKey: "last", group: "Identification", defaultVisible: true },
    { id: "lastStage", header: "Last Measured Stage (ft)", accessorKey: "lastStage", group: "Measurement", defaultVisible: true },
    { id: "lastFlow", header: "Last Measured Flow (cfs)", accessorKey: "lastFlow", group: "Measurement", defaultVisible: true },
    { id: "count", header: "Count", accessorKey: "count", group: "Measurement", defaultVisible: true },
    { id: "maxStage", header: "Max Stage (ft)", accessorKey: "maxStage", group: "Measurement", defaultVisible: true },
    { id: "dateMaxStage", header: "Date of Max Stage", accessorKey: "dateMaxStage", group: "Measurement", defaultVisible: true },
    { id: "currentStage", header: "Current Stage (ft)", accessorKey: "currentStage", group: "Time Series", defaultVisible: true },
    { id: "dateCurrentStage", header: "Date of Current Stage", accessorKey: "dateCurrentStage", group: "Time Series", defaultVisible: true },
    { id: "currentFlow", header: "Current Flow (cfs)", accessorKey: "currentFlow", group: "Time Series", defaultVisible: true },
    { id: "timezone", header: "Time Zone", accessorKey: "timezone", group: "Geography", defaultVisible: true },
    { id: "latitude", header: "Latitude", accessorKey: "latitude", group: "Geography", defaultVisible: true },
    ...aliasColumnDefs(),
  ],
  rows: ["AARK", "ADDI", "ALBE", "ALBT", "ALEX", "ALTA", "ALTO", "ALVA", "AMAR", "AMAZ", "AMER"].map((location, index) => ({
    id: location,
    kind: "measurement",
    label: location,
    location,
    first: `${1928 + index}-06-17 22:00`,
    last: `202${index % 4}-07-01 14:31`,
    lastStage: Number((12 + index / 3).toFixed(2)),
    lastFlow: 1200 + index * 31,
    count: 38 + index,
    maxStage: Number((24 + index / 2).toFixed(2)),
    dateMaxStage: `202${index % 5}-05-12 10:00`,
    currentStage: Number((18 + index / 5).toFixed(2)),
    dateCurrentStage: "2026-05-19 12:00",
    currentFlow: 2100 + index * 47,
    timezone: index % 3 === 0 ? "CST6CDT" : "US/Central",
    latitude: 37 + index / 12,
    aliases: { ...aliasDefaults, "USGS Station Number": `0716${index}500` },
  })),
};

export function buildPlotPoints(seriesNames: string[]): PlotPoint[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const point: PlotPoint = { date: `2026-05-19 ${String(hour).padStart(2, "0")}:00` };
    seriesNames.forEach((name, index) => {
      point[name] = Number((10 + Math.sin(hour / 3 + index) * 4 + index * 2 + hour / 10).toFixed(2));
    });
    return point;
  });
}
