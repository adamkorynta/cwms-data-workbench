import { describe, expect, it } from "vitest";
import { applyLocationMetadataToLocationRow, enrichTimeSeriesRowWithLocationMetadata } from "./locationMetadataService";

describe("locationMetadataService", () => {
  it("enriches time series rows from shared location metadata", () => {
    const row = enrichTimeSeriesRowWithLocationMetadata(
      {
        id: "SWT:AARK.Flow.Inst.1Hour.0.Production",
        kind: "timeSeries",
        label: "AARK.Flow.Inst.1Hour.0.Production",
        location: "AARK",
        timezone: "",
        aliases: { "USGS Station Number": "from-ts" },
      },
      {
        location: "AARK",
        publicName: "Arkansas River",
        timezone: "CST6CDT",
        latitude: 35.5,
        aliases: { "CBT Station ID": "AARK-CBT", "USGS Station Number": "from-location" },
      },
    );

    expect(row.publicName).toBe("Arkansas River");
    expect(row.timezone).toBe("CST6CDT");
    expect(row.latitude).toBe(35.5);
    expect(row.aliases).toMatchObject({
      "CBT Station ID": "AARK-CBT",
      "USGS Station Number": "from-ts",
    });
  });

  it("applies shared location metadata to location rows", () => {
    const row = applyLocationMetadataToLocationRow(
      {
        id: "AARK",
        kind: "location",
        label: "AARK",
        location: "AARK",
        aliases: { LRD: "row-value" },
      },
      {
        location: "AARK",
        office: "SWT",
        publicName: "Arkansas River",
        longName: "Arkansas River at Example",
        locationKind: "SITE",
        locationType: "RIVER",
        timezone: "US/Central",
        nation: "US",
        state: "OK",
        county: "Tulsa",
        nearestCity: "Tulsa",
        horizontalDatum: "WGS84",
        longitude: -95.9,
        latitude: 36.1,
        publishedLongitude: -95.91,
        publishedLatitude: 36.12,
        elevation: 610,
        elevationUnits: "ft",
        verticalDatum: "NAVD88",
        mapLabel: "AARK Label",
        boundingOffice: "SWT",
        active: true,
        aliases: { "CBT Station ID": "AARK-CBT" },
      },
    );

    expect(row.office).toBe("SWT");
    expect(row.publicName).toBe("Arkansas River");
    expect(row.longName).toBe("Arkansas River at Example");
    expect(row.locationType).toBe("RIVER");
    expect(row.state).toBe("OK");
    expect(row.longitude).toBe(-95.9);
    expect(row.latitude).toBe(36.1);
    expect(row.publishedLongitude).toBe(-95.91);
    expect(row.elevation).toBe(610);
    expect(row.unit).toBe("ft");
    expect(row.active).toBe(true);
    expect(row.publishedLatitude).toBe(36.12);
    expect(row.aliases).toMatchObject({
      "CBT Station ID": "AARK-CBT",
      LRD: "row-value",
    });
  });

  it("parses base and sub location from hyphenated location id", () => {
    const row = applyLocationMetadataToLocationRow(
      {
        id: "AARK-OUT",
        kind: "location",
        label: "AARK-OUT",
        location: "AARK-OUT",
      },
      {
        location: "AARK-OUT",
      },
    );

    expect(row.baseLocation).toBe("AARK");
    expect(row.subLocation).toBe("OUT");
  });
});
