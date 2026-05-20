import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchPlotData } from "./inventoryServices";

const mocks = vi.hoisted(() => ({
  getTimeSeries: vi.fn(),
  createCwmsApi: vi.fn(),
}));

vi.mock("../api/cdaClient", () => ({
  createCwmsApi: mocks.createCwmsApi,
  getCdaConfig: () => ({ office: "SWT", baseUrl: "https://example.test" }),
}));

describe("fetchPlotData", () => {
  beforeEach(() => {
    mocks.createCwmsApi.mockReset();
    mocks.getTimeSeries.mockReset();
  });

  it("keeps successful series when one series fails", async () => {
    mocks.createCwmsApi.mockResolvedValue({ getTimeSeries: mocks.getTimeSeries } as never);

    mocks.getTimeSeries.mockImplementation(async ({ name }: { name: string }) => {
      if (name === "bad.series") {
        throw new Error("boom");
      }

      return {
        values: [["2026-05-19T00:00:00Z", 12]],
        nextPage: undefined,
      };
    });

    await expect(
      fetchPlotData(
        ["good.series", "bad.series"],
        {
          mode: "none",
          startDate: "",
          startTime: "",
          endDate: "",
          endTime: "",
          goBack: 7,
          goBackUnit: "days",
          goForward: 0,
          goForwardUnit: "days",
          waterYearStart: "09-30",
          retainBetweenSessions: true,
        },
      ),
    ).resolves.toEqual([
      {
        date: "2026-05-19T00:00:00Z",
        "good.series": 12,
      },
    ]);
  });

  it("filters duplicate time series ids before fetching", async () => {
    mocks.createCwmsApi.mockResolvedValue({ getTimeSeries: mocks.getTimeSeries } as never);

    mocks.getTimeSeries.mockResolvedValue({
      values: [["2026-05-19T00:00:00Z", 12]],
      nextPage: undefined,
    });

    await expect(
      fetchPlotData(
        ["good.series", "good.series"],
        {
          mode: "none",
          startDate: "",
          startTime: "",
          endDate: "",
          endTime: "",
          goBack: 7,
          goBackUnit: "days",
          goForward: 0,
          goForwardUnit: "days",
          waterYearStart: "09-30",
          retainBetweenSessions: true,
        },
      ),
    ).resolves.toEqual([
      {
        date: "2026-05-19T00:00:00Z",
        "good.series": 12,
      },
    ]);

    expect(mocks.getTimeSeries).toHaveBeenCalledTimes(1);
  });
});