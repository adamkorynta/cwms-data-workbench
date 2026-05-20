import { describe, expect, it } from "vitest";
import { mapTimeSeriesCatalogEntry, parseTimeSeriesId } from "./timeSeriesCatalogMapper";

describe("parseTimeSeriesId", () => {
  it("extracts the six CWMS identifier parts", () => {
    expect(parseTimeSeriesId("AARK.Stage.Inst.15Minutes.0.Production")).toEqual({
      location: "AARK",
      parameter: "Stage",
      type: "Inst",
      interval: "15Minutes",
      duration: "0",
      version: "Production",
    });
  });
});

describe("mapTimeSeriesCatalogEntry", () => {
  it("maps a CDA catalog entry to an inventory row", () => {
    const row = mapTimeSeriesCatalogEntry(
      {
        office: "SWT",
        name: "CLAK.Flow.Inst.1Hour.0.Ccp-Rev",
        units: "cms",
        interval: "1Hour",
        intervalOffset: 0,
        timeZone: "CST6CDT",
        extents: [{ earliestTime: new Date("2020-01-01T00:00:00Z"), latestTime: new Date("2020-01-02T00:00:00Z") }],
        aliases: [{ name: "USGS Station Number", value: "06856600" }],
      },
      4,
    );

    expect(row.number).toBe(5);
    expect(row.location).toBe("CLAK");
    expect(row.parameter).toBe("Flow");
    expect(row.aliases?.["USGS Station Number"]).toBe("06856600");
  });
});
