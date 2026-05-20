import type { TimeWindow } from "../types";
import { GwCheckbox } from "./GroundworkControls";

interface TimeWindowDialogProps {
  open: boolean;
  value: TimeWindow;
  onChange: (value: TimeWindow) => void;
  onClose: () => void;
}

export function TimeWindowDialog({ open, value, onChange, onClose }: TimeWindowDialogProps) {
  if (!open) return null;

  const update = (patch: Partial<TimeWindow>) => onChange({ ...value, ...patch });

  return (
    <div className="modal-backdrop">
      <section className="time-window-dialog" role="dialog" aria-modal="true" aria-label="Set Time Window">
        <header>
          <strong>Set Time Window</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">
          <label className="mode-row">
            <input type="radio" checked={value.mode === "none"} onChange={() => update({ mode: "none" })} />
            No Time Window
          </label>

          <fieldset>
            <label className="mode-row">
              <input type="radio" checked={value.mode === "specific"} onChange={() => update({ mode: "specific" })} />
              Specific Time Window
            </label>
            <div className="form-grid compact">
              <label>Start Date<input type="date" value={value.startDate} onChange={(event) => update({ startDate: event.target.value })} /></label>
              <label>Start Time<input value={value.startTime} onChange={(event) => update({ startTime: event.target.value })} /></label>
              <label>End Date<input type="date" value={value.endDate} onChange={(event) => update({ endDate: event.target.value })} /></label>
              <label>End Time<input value={value.endTime} onChange={(event) => update({ endTime: event.target.value })} /></label>
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => update({ startDate: "", startTime: "", endDate: "", endTime: "" })}>Clear</button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  update({ endDate: today, endTime: "24:00" });
                }}
              >
                Set Current Time
              </button>
            </div>
          </fieldset>

          <fieldset>
            <label className="mode-row">
              <input type="radio" checked={value.mode === "relative"} onChange={() => update({ mode: "relative" })} />
              Relative to Current Time
            </label>
            <div className="form-grid compact">
              <label>Go Back<input type="number" value={value.goBack} onChange={(event) => update({ goBack: Number(event.target.value) })} /></label>
              <label>Unit<select value={value.goBackUnit} onChange={(event) => update({ goBackUnit: event.target.value as TimeWindow["goBackUnit"] })}><option>hours</option><option>days</option><option>months</option><option>years</option></select></label>
              <label>Go Forward<input type="number" value={value.goForward} onChange={(event) => update({ goForward: Number(event.target.value) })} /></label>
              <label>Unit<select value={value.goForwardUnit} onChange={(event) => update({ goForwardUnit: event.target.value as TimeWindow["goForwardUnit"] })}><option>hours</option><option>days</option><option>months</option><option>years</option></select></label>
            </div>
          </fieldset>

          <fieldset>
            <label className="mode-row">
              <input type="radio" checked={value.mode === "waterYear"} onChange={() => update({ mode: "waterYear" })} />
              By Individual Water Year
            </label>
            <label className="wide-label">Start Date of Water Year<input value={value.waterYearStart} onChange={(event) => update({ waterYearStart: event.target.value })} /></label>
          </fieldset>

          <GwCheckbox
            id="retain-time-window"
            className="mode-row"
            label="Retain Between Sessions"
            checked={value.retainBetweenSessions}
            onChange={(event) => update({ retainBetweenSessions: event.target.checked })}
          />
        </div>
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={onClose}>Apply</button>
          <button type="button" className="primary" onClick={onClose}>OK</button>
        </footer>
      </section>
    </div>
  );
}
