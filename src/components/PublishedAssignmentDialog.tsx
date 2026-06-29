import { X, Save, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { GwButton, GwInput } from "./GroundworkControls";
import { fetchParameters, fetchAvailableTimeSeries, type PublishedTimeSeriesAssignment } from "../services/publishedService";

interface PublishedAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  initialLocationId?: string;
}

export function PublishedAssignmentDialog({ open, onClose, initialLocationId }: PublishedAssignmentDialogProps) {
  const [locationId, setLocationId] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [selectedParameter, setSelectedParameter] = useState("");
  const [availableTimeSeries, setAvailableTimeSeries] = useState<PublishedTimeSeriesAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      fetchParameters().then(setParameters);
      if (initialLocationId) {
        setLocationId(initialLocationId);
      } else {
        setLocationId("");
      }
      setSelectedParameter("");
      setAvailableTimeSeries([]);
      setSearchQuery("");
    }
  }, [open, initialLocationId]);

  const handleSearch = async () => {
    if (!locationId || !selectedParameter) return;
    setLoading(true);
    try {
      const ts = await fetchAvailableTimeSeries(locationId, selectedParameter);
      setAvailableTimeSeries(ts);
    } catch (e) {
      console.error("Failed to fetch available time series", e);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const filteredTS = availableTimeSeries.filter(ts => 
    ts.timeSeriesId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-backdrop editor-backdrop">
      <section className="published-assignment-dialog" role="dialog" aria-modal="true" aria-label="Assign Published Time Series" style={{ width: "600px", background: "white", borderRadius: "4px", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>
        <header style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Assign Published Time Series</strong>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{ border: "none", background: "transparent", cursor: "pointer" }}><X size={16} /></button>
        </header>
        
        <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", marginBottom: "16px", alignItems: "end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold" }}>Location ID</span>
              <GwInput value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="e.g. AARK" readOnly disabled />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold" }}>Parameter</span>
              <select 
                value={selectedParameter} 
                onChange={(e) => setSelectedParameter(e.target.value)}
                style={{ height: "32px", padding: "0 8px", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value="">Select Parameter</option>
                {parameters.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <GwButton variant="primary" onClick={handleSearch} disabled={!locationId || !selectedParameter || loading}>
              <Search size={14} />
              Search
            </GwButton>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: "4px", minHeight: "200px" }}>
            <div style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
              <GwInput 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                placeholder="Filter results..." 
              />
            </div>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
              ) : filteredTS.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9f9f9", textAlign: "left" }}>
                      <th style={{ padding: "8px", fontSize: "12px" }}>Time Series ID</th>
                      <th style={{ padding: "8px", fontSize: "12px", width: "80px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTS.map((ts) => (
                      <tr key={ts.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px", fontSize: "13px" }}>{ts.timeSeriesId}</td>
                        <td style={{ padding: "8px" }}>
                          <GwButton variant="subtle" onClick={() => console.log("Assign", ts)}>Assign</GwButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                  {locationId && selectedParameter ? "No time series found for this combination." : "Enter Location and Parameter to search."}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer style={{ padding: "12px 16px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <GwButton onClick={onClose}>Cancel</GwButton>
          <GwButton variant="primary" onClick={onClose}><Save size={14} /> Done</GwButton>
        </footer>
      </section>
    </div>
  );
}
