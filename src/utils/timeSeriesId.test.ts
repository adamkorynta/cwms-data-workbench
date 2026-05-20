import { describe, expect, it } from "vitest";
import { composeTimeSeriesId } from "../components/TimeSeriesEditor";

describe("composeTimeSeriesId", () => {
  it("builds a CWMS time series identifier from parts", () => {
    expect(
      composeTimeSeriesId({
        location: "AARK",
        parameter: "Stage",
        type: "Inst",
        interval: "1Hour",
        duration: "0",
        version: "Production",
      }),
    ).toBe("AARK.Stage.Inst.1Hour.0.Production");
  });
});
