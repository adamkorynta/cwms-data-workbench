import { useEffect, useMemo, useRef } from "react";
import { divIcon, type LatLngBoundsExpression, type LatLngExpression, type Marker as LeafletMarker } from "leaflet";
import { LayersControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export interface GeoMapPoint {
  locationId: string;
  latitude: number;
  longitude: number;
  locationKind?: string;
  locationSelected: boolean;
  seriesCount: number;
  seriesIds: string[];
  sparklineValues: number[];
  sparklineLabel: string;
}

interface KindStyle {
  glyph: string;
  color: string;
}

const KIND_STYLES: Record<string, KindStyle> = {
  STREAM_GAGE: { glyph: "🌊", color: "#1d4ed8" },
  STREAM_REACH: { glyph: "🛶", color: "#0f766e" },
  PUMP: { glyph: "🛞", color: "#be123c" },
  WEATHER_GAGE: { glyph: "⛅", color: "#0369a1" },
  ENTITY: { glyph: "🏷", color: "#6d28d9" },
  SITE: { glyph: "📍", color: "#334155" },
  STREAM: { glyph: "🌊", color: "#0284c7" },
  BASIN: { glyph: "🗺", color: "#0f766e" },
  PROJECT: { glyph: "🏗", color: "#92400e" },
  EMBANKMENT: { glyph: "🧱", color: "#7c3aed" },
  OUTLET: { glyph: "🚰", color: "#1f2937" },
  TURBINE: { glyph: "⚙", color: "#4338ca" },
  LOCK: { glyph: "🔒", color: "#475569" },
  STREAM_LOCATION: { glyph: "📍", color: "#0e7490" },
  GATE: { glyph: "🚪", color: "#9a3412" },
  OVERFLOW: { glyph: "💧", color: "#b45309" },
};

const DEFAULT_KIND_STYLE: KindStyle = { glyph: "📌", color: "#64748b" };

function normalizeLocationKind(kind: string | undefined): string {
  if (!kind) return "";
  return kind.trim().toUpperCase().replace(/-/g, "_");
}

function getKindStyle(kind: string | undefined): KindStyle {
  const normalized = normalizeLocationKind(kind);
  return KIND_STYLES[normalized] ?? DEFAULT_KIND_STYLE;
}

interface GeoSelectionMapProps {
  points: GeoMapPoint[];
  selectedLocationId?: string | null;
}

function FitBounds({ points }: { points: GeoMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 9, { animate: true });
      return;
    }

    const bounds: LatLngBoundsExpression = points.map((point) => [point.latitude, point.longitude]);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 10, animate: true });
  }, [map, points]);

  return null;
}

function SparklineSvg({ values }: { values: number[] }) {
  const path = useMemo(() => {
    if (values.length < 2) return "";
    const width = 120;
    const height = 36;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / span) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  if (!path) return <span className="map-spark-empty">No data</span>;

  return (
    <svg viewBox="0 0 120 36" width="120" height="36" className="map-spark-svg" role="img" aria-label="Recent time series trend">
      <path d={path} fill="none" stroke="#1d4ed8" strokeWidth="2" />
    </svg>
  );
}

function FocusSelectedLocation({
  points,
  selectedLocationId,
  markerRefs,
}: {
  points: GeoMapPoint[];
  selectedLocationId?: string | null;
  markerRefs: React.RefObject<Map<string, LeafletMarker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedLocationId) return;
    const selectedPoint = points.find((point) => point.locationId === selectedLocationId);
    if (!selectedPoint) return;

    map.setView([selectedPoint.latitude, selectedPoint.longitude], Math.max(map.getZoom(), 9), { animate: true });
    const marker = markerRefs.current?.get(selectedLocationId);
    marker?.openPopup();
  }, [map, markerRefs, points, selectedLocationId]);

  return null;
}

export function GeoSelectionMap({ points, selectedLocationId }: GeoSelectionMapProps) {
  const defaultCenter: LatLngExpression = [39.5, -98.35];
  const markerRefs = useRef<Map<string, LeafletMarker>>(new Map());

  return (
    <MapContainer className="geo-selection-map" center={defaultCenter} zoom={4} minZoom={3} scrollWheelZoom>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Carto Light">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <FitBounds points={points} />
      <FocusSelectedLocation points={points} selectedLocationId={selectedLocationId} markerRefs={markerRefs} />

      {points.map((point) => (
        <Marker
          key={point.locationId}
          ref={(marker) => {
            if (marker) markerRefs.current.set(point.locationId, marker);
            else markerRefs.current.delete(point.locationId);
          }}
          position={[point.latitude, point.longitude]}
          zIndexOffset={selectedLocationId === point.locationId ? 1000 : 0}
          icon={divIcon({
            className: "map-kind-pin-wrapper",
            html: `<div class="map-kind-pin ${point.locationSelected ? "selected" : ""}" style="--pin-color:${getKindStyle(point.locationKind).color}"><span>${getKindStyle(point.locationKind).glyph}</span></div>`,
            iconSize: [26, 38],
            iconAnchor: [13, 36],
            popupAnchor: [0, -30],
          })}
        >
          <Popup minWidth={360} maxWidth={860}>
            <div className="map-popup">
              <strong>{point.locationId}</strong>
              <span>Kind: {normalizeLocationKind(point.locationKind) || "UNKNOWN"}</span>
              <span>{point.seriesCount} time series</span>
              {point.seriesIds.length > 0 && (
                <ul className="map-popup-series-list" aria-label="Time series at location">
                  {point.seriesIds.map((seriesId) => (
                    <li key={seriesId}>{seriesId}</li>
                  ))}
                </ul>
              )}
              <SparklineSvg values={point.sparklineValues} />
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}