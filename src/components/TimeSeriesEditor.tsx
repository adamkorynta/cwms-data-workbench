import { LineChart, Save, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { GwCheckbox } from "./GroundworkControls";

export interface TimeSeriesIdParts {
  location: string;
  parameter: string;
  type: string;
  interval: string;
  duration: string;
  version: string;
}

export function composeTimeSeriesId(parts: TimeSeriesIdParts) {
  return [parts.location, parts.parameter, parts.type, parts.interval, parts.duration, parts.version].join(".");
}

interface TimeSeriesEditorProps {
  open: boolean;
  onClose: () => void;
}

export function TimeSeriesEditor({ open, onClose }: TimeSeriesEditorProps) {
  const [parts, setParts] = useState<TimeSeriesIdParts>({
    location: "AARK",
    parameter: "Stage",
    type: "Inst",
    interval: "1Hour",
    duration: "0",
    version: "Production",
  });
  const [office, setOffice] = useState("SWT");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [units, setUnits] = useState("ft");
  const [regular, setRegular] = useState(true);
  const idPreview = useMemo(() => composeTimeSeriesId(parts), [parts]);

  if (!open) return null;

  const setPart = (key: keyof TimeSeriesIdParts, value: string) => setParts((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-backdrop editor-backdrop">
      <section className="ts-editor" role="dialog" aria-modal="true" aria-label="New Time Series Data Entry">
        <header>
          <div>
            <strong>New Time Series / Data Entry</strong>
            <span>{idPreview}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor"><X size={16} /></button>
        </header>
        <div className="editor-layout">
          <section className="editor-form">
            <h2>Identifier Parts</h2>
            <div className="form-grid">
              <label>Office ID<input value={office} onChange={(event) => setOffice(event.target.value)} /></label>
              <label>Location<input list="locations" value={parts.location} onChange={(event) => setPart("location", event.target.value)} /></label>
              <label>Parameter<select value={parts.parameter} onChange={(event) => setPart("parameter", event.target.value)}><option>Stage</option><option>Flow</option><option>Precip</option><option>Temp-Water</option><option>Elev</option></select></label>
              <label>Sub-Parameter<input placeholder="Optional" /></label>
              <label>Type<select value={parts.type} onChange={(event) => setPart("type", event.target.value)}><option>Inst</option><option>Mean</option><option>Total</option></select></label>
              <label>Interval<select value={parts.interval} onChange={(event) => setPart("interval", event.target.value)}><option>15Minutes</option><option>1Hour</option><option>1Day</option><option>Irregular</option></select></label>
              <label>Interval Offset<input placeholder="0s" /></label>
              <label>Duration<select value={parts.duration} onChange={(event) => setPart("duration", event.target.value)}><option>0</option><option>1Hour</option><option>1Day</option></select></label>
              <label>Version<input value={parts.version} onChange={(event) => setPart("version", event.target.value)} /></label>
              <label>Time Zone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
              <label>Units<input value={units} onChange={(event) => setUnits(event.target.value)} /></label>
              <GwCheckbox
                id="time-series-regular"
                className="checkbox-label"
                label="Regular"
                checked={regular}
                onChange={(event) => setRegular(event.target.checked)}
              />
            </div>
            <div className="id-preview">
              <span>Time Series Identifier</span>
              <strong>{idPreview}</strong>
            </div>
            <div className="form-grid">
              <label>Start Date<input type="date" defaultValue="2026-03-01" /></label>
              <label>Start Time<input defaultValue="0000" /></label>
            </div>
          </section>
          <section className="entry-grid-section">
            <div className="entry-tabs">
              <button type="button" className="active">Manual Entry</button>
              <button type="button">Automatic Generation</button>
              <button type="button">Paste</button>
            </div>
            <table className="entry-grid">
              <thead>
                <tr><th>Ordinate</th><th>Date</th><th>Time</th><th>Value</th><th>Quality</th></tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }, (_, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td contentEditable suppressContentEditableWarning>{index === 0 ? "28 Feb 2026" : ""}</td>
                    <td contentEditable suppressContentEditableWarning>{index === 0 ? "24:00" : ""}</td>
                    <td contentEditable suppressContentEditableWarning>{index === 0 ? "2" : ""}</td>
                    <td contentEditable suppressContentEditableWarning />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="preview-pane">
            <h2>Validation</h2>
            <p className="good">Identifier is complete and ready to validate against CDA.</p>
            <h2>Plot Preview</h2>
            <div className="mini-chart"><LineChart size={42} /><span>Preview updates as rows change.</span></div>
          </aside>
        </div>
        <footer>
          <button type="button"><Wand2 size={14} /> Graphically Edit</button>
          <button type="button"><LineChart size={14} /> Plot</button>
          <button type="button" className="primary"><Save size={14} /> Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </footer>
        <datalist id="locations">
          <option value="AARK" />
          <option value="ADDI" />
          <option value="ALBE" />
          <option value="TULA" />
        </datalist>
      </section>
    </div>
  );
}
