import type { TimeWindow } from "../types";

export const defaultTimeWindow: TimeWindow = {
  mode: "relative",
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
};

export function formatTimeWindow(window: TimeWindow): string {
  if (window.mode === "none") return "No time window";
  if (window.mode === "relative") {
    return `Relative: back ${window.goBack} ${window.goBackUnit}, forward ${window.goForward} ${window.goForwardUnit}`;
  }
  if (window.mode === "waterYear") return `Water year starts ${window.waterYearStart}`;
  return `${window.startDate} ${window.startTime} to ${window.endDate} ${window.endTime}`;
}
