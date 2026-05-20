import { describe, expect, it } from "vitest";
import { parseOffices } from "./officesService";

describe("parseOffices", () => {
  it("parses common CDA office payload shapes", () => {
    expect(parseOffices({ offices: [{ "office-id": "SWT", "long-name": "Tulsa" }, { officeId: "LRL" }] })).toEqual([
      { id: "LRL", name: undefined },
      { id: "SWT", name: "Tulsa" },
    ]);
  });

  it("deduplicates string office lists", () => {
    expect(parseOffices(["SWT", "SWT", "LRL"])).toEqual([{ id: "LRL" }, { id: "SWT" }]);
  });
});
