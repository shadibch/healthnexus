import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type L from "leaflet";
import { MapPin } from "lucide-react";

interface LocationPickerMapProps {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  readOnly?: boolean;
  height?: number;
  label?: string;
}

const ABU_DHABI: [number, number] = [24.4539, 54.3773];

export function LocationPickerMap({
  lat,
  lng,
  onChange,
  readOnly = false,
  height = 280,
  label,
}: LocationPickerMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const hasCoords = !isNaN(latNum) && !isNaN(lngNum);

  // ── Init map once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const initLat = !isNaN(parseFloat(lat)) ? parseFloat(lat) : ABU_DHABI[0];
    const initLng = !isNaN(parseFloat(lng)) ? parseFloat(lng) : ABU_DHABI[1];
    const initZoom = !isNaN(parseFloat(lat)) ? 15 : 10;

    import("leaflet").then((Lm) => {
      const L = Lm.default;
      if (!mapDivRef.current || mapRef.current) return;

      const map = L.map(mapDivRef.current, { zoomControl: true }).setView(
        [initLat, initLng],
        initZoom
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      const clinicIcon = L.divIcon({
        className: "",
        html: `<div style="background:#059669;width:38px;height:38px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.35)">🏥</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      });

      const placeOrMoveMarker = (clickLat: number, clickLng: number) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          const m = L.marker([clickLat, clickLng], {
            icon: clinicIcon,
            draggable: !readOnly,
          }).addTo(map);
          if (!readOnly) {
            m.on("dragend", () => {
              const pos = m.getLatLng();
              onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
            });
          }
          markerRef.current = m;
        }
        if (!readOnly) {
          onChangeRef.current(clickLat.toFixed(6), clickLng.toFixed(6));
        }
      };

      if (!isNaN(initLat) && initLat !== ABU_DHABI[0]) {
        placeOrMoveMarker(initLat, initLng);
      }

      if (!readOnly) {
        map.on("click", (e: L.LeafletMouseEvent) => {
          placeOrMoveMarker(e.latlng.lat, e.latlng.lng);
        });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update marker when lat/lng props change (e.g. after geocoding) ───────
  useEffect(() => {
    const map = mapRef.current;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (!map || isNaN(latN) || isNaN(lngN)) return;

    import("leaflet").then((Lm) => {
      const L = Lm.default;

      const clinicIcon = L.divIcon({
        className: "",
        html: `<div style="background:#059669;width:38px;height:38px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.35)">🏥</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20],
      });

      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        const m = L.marker([latN, lngN], {
          icon: clinicIcon,
          draggable: !readOnly,
        }).addTo(map);
        if (!readOnly) {
          m.on("dragend", () => {
            const pos = m.getLatLng();
            onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });
        }
        markerRef.current = m;
      }
      map.flyTo([latN, lngN], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.7,
      });
    });
  }, [lat, lng, readOnly]);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border shadow-sm"
      style={{ height }}
    >
      <div ref={mapDivRef} className="w-full h-full" />

      {/* Overlay hints */}
      {!readOnly && !hasCoords && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="bg-background/95 backdrop-blur-sm text-xs px-3 py-1.5 rounded-full border border-border shadow flex items-center gap-1.5 text-muted-foreground whitespace-nowrap">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            Click on the map to pin your clinic location · or drag the pin
          </div>
        </div>
      )}
      {!readOnly && hasCoords && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="bg-background/95 backdrop-blur-sm text-xs px-3 py-1.5 rounded-full border border-emerald-300 shadow flex items-center gap-1.5 text-emerald-700 whitespace-nowrap">
            <MapPin className="w-3.5 h-3.5" />
            {label ?? `📍 ${latNum.toFixed(5)}, ${lngNum.toFixed(5)} · Click to reposition`}
          </div>
        </div>
      )}
    </div>
  );
}
