import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./inventoryServices";

describe("fetchAllPages", () => {
  it("returns already-loaded rows when a later page fails and partial results are allowed", async () => {
    const result = await fetchAllPages(
      async (pageToken) => {
        if (pageToken === "page-3") throw new Error("Page 3 failed");
        return {
          rows: pageToken === "page-2" ? ["b"] : ["a"],
          nextPageToken: pageToken === "page-2" ? "page-3" : "page-2",
          total: 3,
        };
      },
      { allowPartial: true, pageSize: 1 },
    );

    expect(result.rows).toEqual(["a", "b"]);
    expect(result.pageInfo.partial).toBe(true);
    expect(result.pageInfo.pagesLoaded).toBe(2);
    expect(result.pageInfo.errorPage).toBe(3);
  });
});
