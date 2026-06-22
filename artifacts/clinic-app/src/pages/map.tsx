import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MapPin, Stethoscope, Pill, Navigation, Phone, Clock,
  CheckCircle2, AlertCircle, XCircle, Search, Loader2,
  ChevronDown, Building2, Star,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import type L from "leaflet";
import { useClinicSettings } from "@/lib/clinic-settings";

const ABU_DHABI: [number, number] = [24.4539, 54.3773];

interface NearbyDoctor {
  id: number; first_name: string; last_name: string;
  specialization: string; phone: string | null; email: string | null;
  is_available: boolean; consultation_fee: number | null;
  bio: string | null; clinic_address: string | null;
  latitude: number; longitude: number; distance_km: number;
}

interface NearbyPharmacy {
  id: number; name: string; address: string | null; phone: string | null;
  is_open_24h: boolean; latitude: number; longitude: number; distance_km: number;
}

interface PharmacyCheckResult extends NearbyPharmacy {
  available_count: number; available_ids: number[];
  total_requested: number; hasAll: boolean; hasSome: boolean; hasNone: boolean;
  missingIds: number[];
}

interface PrescriptionItem {
  id: number; medicationId: number; medicationName: string | null;
  dosage: string; frequency: string; duration: string | null; quantity: number;
}

interface Prescription {
  id: number; status: string; notes: string | null;
  issuedAt: string; patientName: string | null; doctorName: string | null;
  items: PrescriptionItem[];
}

type TabType = "doctors" | "pharmacies" | "prescription" | "clinic";

function kmLabel(km: number, ar: boolean) {
  if (km < 1) return ar ? `${Math.round(km * 1000)} م` : `${Math.round(km * 1000)} m`;
  return ar ? `${km.toFixed(1)} كم` : `${km.toFixed(1)} km`;
}

export default function MapPage() {
  const { lang, isRTL } = useI18n();
  const { user } = useAuth();
  const {
    currency,
    clinicName,
    latitude: clinicLat,
    longitude: clinicLng,
    address: clinicAddress,
    city: clinicCity,
    country: clinicCountry,
  } = useClinicSettings();
  const ar = lang === "ar";

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationStatus, setLocationStatus] = useState<"detecting" | "ok" | "denied" | "default">("detecting");
  const [tab, setTab] = useState<TabType>("doctors");

  // Prescription finder state
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<number | null>(null);
  const [selectedMedIds, setSelectedMedIds] = useState<number[]>([]);
  const [checkTriggered, setCheckTriggered] = useState(false);
  const [customMedIds, setCustomMedIds] = useState<string>("");

  // Map refs
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);

  // ── Geolocation ──────────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    setLocationStatus("detecting");
    if (!navigator.geolocation) {
      setUserLocation(ABU_DHABI);
      setLocationStatus("default");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocationStatus("ok");
      },
      () => {
        setUserLocation(ABU_DHABI);
        setLocationStatus("denied");
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  const lat = userLocation?.[0] ?? ABU_DHABI[0];
  const lng = userLocation?.[1] ?? ABU_DHABI[1];

  // ── Queries ──────────────────────────────────────────────────────────
  const doctorsQuery = useQuery<NearbyDoctor[]>({
    queryKey: ["map-doctors", lat, lng],
    queryFn: () => apiFetch(`/map/doctors?lat=${lat}&lng=${lng}&limit=10`),
    enabled: !!userLocation,
  });

  const pharmaciesQuery = useQuery<NearbyPharmacy[]>({
    queryKey: ["map-pharmacies", lat, lng],
    queryFn: () => apiFetch(`/map/pharmacies?lat=${lat}&lng=${lng}&limit=20`),
    enabled: !!userLocation,
  });

  const prescriptionsQuery = useQuery<Prescription[]>({
    queryKey: ["prescriptions"],
    queryFn: () => apiFetch("/prescriptions"),
    enabled: tab === "prescription",
  });

  const selectedPrescription = prescriptionsQuery.data?.find(
    (p) => p.id === selectedPrescriptionId
  );

  // Sync selected med IDs when prescription changes
  useEffect(() => {
    if (selectedPrescription) {
      setSelectedMedIds(
        selectedPrescription.items.map((i) => i.medicationId).filter(Boolean)
      );
      setCheckTriggered(false);
    }
  }, [selectedPrescriptionId]);

  const prescriptionCheckQuery = useQuery<{ pharmacies: PharmacyCheckResult[]; items: PrescriptionItem[] }>({
    queryKey: ["map-rx-check", selectedPrescriptionId, lat, lng],
    queryFn: () =>
      apiFetch(`/map/prescription/${selectedPrescriptionId}/pharmacies?lat=${lat}&lng=${lng}`),
    enabled: checkTriggered && !!selectedPrescriptionId && !!userLocation,
  });

  const customCheckQuery = useQuery<PharmacyCheckResult[]>({
    queryKey: ["map-custom-check", customMedIds, lat, lng],
    queryFn: () =>
      apiFetch(`/map/pharmacies/check-meds?medicationIds=${customMedIds}&lat=${lat}&lng=${lng}`),
    enabled: checkTriggered && !!customMedIds && !selectedPrescriptionId && !!userLocation,
  });

  // ── Leaflet map ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userLocation || !mapDivRef.current) return;
    if (mapRef.current) return;

    import("leaflet").then((Lm) => {
      const L = Lm.default;
      if (!mapDivRef.current) return;

      const map = L.map(mapDivRef.current).setView(userLocation, 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;

      // User location marker
      L.circle(userLocation, {
        radius: 120,
        color: "#3b82f6",
        fillColor: "#93c5fd",
        fillOpacity: 0.35,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(ar ? "موقعك الحالي" : "Your location");
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [userLocation]);

  // ── Update markers when data changes ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    import("leaflet").then((Lm) => {
      const L = Lm.default;

      // Remove old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      const addCircleMarker = (
        lat: number, lng: number,
        color: string, label: string,
        popupHtml: string
      ) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};width:34px;height:34px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer">${label}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -17],
        });
        const m = L.marker([lat, lng], { icon }).addTo(map).bindPopup(popupHtml);
        markersRef.current.push(m);
      };

      if (tab === "doctors" && doctorsQuery.data) {
        const colors = ["#059669", "#0d9488", "#0891b2", "#4f46e5", "#7c3aed"];
        doctorsQuery.data.forEach((d, i) => {
          addCircleMarker(
            d.latitude, d.longitude,
            colors[i % colors.length],
            "D",
            `<div style="min-width:180px">
              <b>Dr. ${d.first_name} ${d.last_name}</b><br/>
              <span style="color:#6b7280;font-size:12px">${d.specialization}</span><br/>
              ${d.clinic_address ? `<span style="font-size:11px">📍 ${d.clinic_address}</span><br/>` : ""}
              ${d.phone ? `<span style="font-size:11px">📞 ${d.phone}</span><br/>` : ""}
              <b style="color:#059669">${kmLabel(d.distance_km, ar)} away</b>
              ${d.consultation_fee ? ` · ${currency} ${d.consultation_fee}` : ""}
            </div>`
          );
        });
      }

      if (tab === "pharmacies" && pharmaciesQuery.data) {
        pharmaciesQuery.data.forEach((p) => {
          addCircleMarker(
            p.latitude, p.longitude,
            "#2563eb",
            "P",
            `<div style="min-width:160px">
              <b>${p.name}</b><br/>
              ${p.address ? `<span style="font-size:11px">📍 ${p.address}</span><br/>` : ""}
              ${p.phone ? `<span style="font-size:11px">📞 ${p.phone}</span><br/>` : ""}
              <b style="color:#2563eb">${kmLabel(p.distance_km, ar)} away</b>
              ${p.is_open_24h ? " · <span style='color:#059669'>24h</span>" : ""}
            </div>`
          );
        });
      }

      if (tab === "clinic" && clinicLat != null && clinicLng != null) {
        const clinicIcon = L.divIcon({
          className: "",
          html: `<div style="background:#059669;width:46px;height:46px;border-radius:50%;border:4px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🏥</div>`,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
          popupAnchor: [0, -24],
        });
        const locationParts = [clinicAddress, clinicCity, clinicCountry].filter(Boolean).join(", ");
        const m = L.marker([clinicLat, clinicLng], { icon: clinicIcon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:200px">
              <b style="font-size:14px">${clinicName}</b><br/>
              ${locationParts ? `<span style="color:#6b7280;font-size:12px">📍 ${locationParts}</span>` : ""}
            </div>`,
            { maxWidth: 260 }
          )
          .openPopup();
        markersRef.current.push(m);
      }

      if (tab === "prescription") {
        const results = prescriptionCheckQuery.data?.pharmacies ?? customCheckQuery.data ?? [];
        results.forEach((p) => {
          const color = p.hasAll ? "#059669" : p.hasSome ? "#d97706" : "#dc2626";
          const status = p.hasAll ? "✅ Has ALL" : p.hasSome ? `🟡 Has ${p.available_count}/${p.total_requested}` : "❌ Not available";
          addCircleMarker(
            p.latitude, p.longitude,
            color,
            "P",
            `<div style="min-width:180px">
              <b>${p.name}</b><br/>
              ${p.address ? `<span style="font-size:11px">📍 ${p.address}</span><br/>` : ""}
              ${p.phone ? `<span style="font-size:11px">📞 ${p.phone}</span><br/>` : ""}
              <b>${status}</b><br/>
              <b style="color:#2563eb">${kmLabel(p.distance_km, ar)} away</b>
            </div>`
          );
        });
      }
    });
  }, [tab, doctorsQuery.data, pharmaciesQuery.data, prescriptionCheckQuery.data, customCheckQuery.data]);

  // ── Selected prescription items ───────────────────────────────────────
  const rxItems = prescriptionCheckQuery.data?.items ?? selectedPrescription?.items ?? [];

  const toggleMed = (id: number) => {
    setSelectedMedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setCheckTriggered(false);
  };

  const handleCheck = () => {
    if (selectedPrescriptionId) {
      setCheckTriggered(true);
    }
  };

  const checkResults = prescriptionCheckQuery.data?.pharmacies ?? [];
  const isChecking = prescriptionCheckQuery.isFetching;

  // ── Fly to clinic when tab changes to "clinic" ────────────────────────
  useEffect(() => {
    if (tab !== "clinic") return;
    if (clinicLat == null || clinicLng == null) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([clinicLat, clinicLng], 16, { animate: true, duration: 1 });
  }, [tab, clinicLat, clinicLng]);

  const TABS: { id: TabType; label: string; labelAr: string; icon: React.ReactNode }[] = [
    { id: "doctors",      label: "Nearby Doctors",   labelAr: "أقرب الأطباء",    icon: <Stethoscope className="w-3.5 h-3.5" /> },
    { id: "pharmacies",   label: "Pharmacies",        labelAr: "الصيدليات",       icon: <Pill className="w-3.5 h-3.5" /> },
    { id: "prescription", label: "Check Prescription",labelAr: "فحص الوصفة",     icon: <Search className="w-3.5 h-3.5" /> },
    { id: "clinic",       label: "Our Clinic",        labelAr: "عيادتنا",         icon: <Building2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className={cn("flex flex-col h-[calc(100vh-3.5rem)]", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header bar */}
      <div className={cn("flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0 gap-3 flex-wrap", isRTL && "flex-row-reverse")}>
        <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
          <MapPin className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold">{ar ? "اكتشف الرعاية القريبة" : "Find Nearby Care"}</h1>
        </div>
        <div className={cn("flex items-center gap-2 text-xs", isRTL && "flex-row-reverse")}>
          {locationStatus === "detecting" && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {ar ? "تحديد الموقع..." : "Detecting location..."}
            </span>
          )}
          {locationStatus === "ok" && (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Navigation className="w-3 h-3" />
              {ar ? "تم تحديد موقعك" : "Using your location"}
            </span>
          )}
          {(locationStatus === "denied" || locationStatus === "default") && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <MapPin className="w-3 h-3" />
              {ar ? "أبوظبي (افتراضي)" : "Abu Dhabi (default)"}
            </span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={requestLocation}>
            <Navigation className="w-3 h-3" />
            {ar ? "تحديث الموقع" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className={cn("flex gap-1 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 overflow-x-auto", isRTL && "flex-row-reverse")}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t.icon}
            {ar ? t.labelAr : t.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className={cn("flex flex-1 overflow-hidden", isRTL && "flex-row-reverse")}>
        {/* Left sidebar */}
        <div className="w-80 lg:w-96 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">

            {/* ── DOCTORS tab ── */}
            {tab === "doctors" && (
              <div className="p-3 space-y-2">
                {doctorsQuery.isLoading
                  ? [1,2,3,4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
                  : doctorsQuery.data?.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        mapRef.current?.setView([d.latitude, d.longitude], 15);
                      }}
                    >
                      <div className={cn("flex items-start gap-2.5", isRTL && "flex-row-reverse")}>
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Stethoscope className="w-4 h-4 text-emerald-700" />
                        </div>
                        <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                          <p className="text-sm font-semibold truncate">
                            Dr. {d.first_name} {d.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{d.specialization}</p>
                          {d.clinic_address && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              📍 {d.clinic_address}
                            </p>
                          )}
                          <div className={cn("flex items-center gap-2 mt-1 flex-wrap", isRTL && "flex-row-reverse")}>
                            <Badge variant="secondary" className={cn("text-xs gap-1 h-5", d.is_available ? "text-emerald-700 bg-emerald-50" : "text-muted-foreground")}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", d.is_available ? "bg-emerald-500" : "bg-slate-400")} />
                              {d.is_available ? (ar ? "متاح" : "Available") : (ar ? "غير متاح" : "Busy")}
                            </Badge>
                            <span className="text-xs font-semibold text-primary">
                              {kmLabel(d.distance_km, ar)}
                            </span>
                            {d.consultation_fee && (
                              <span className="text-xs text-muted-foreground">{currency} {d.consultation_fee}</span>
                            )}
                          </div>
                          {d.phone && (
                            <a
                              href={`tel:${d.phone}`}
                              className={cn("flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5", isRTL && "flex-row-reverse")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="w-3 h-3" />
                              {d.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ── PHARMACIES tab ── */}
            {tab === "pharmacies" && (
              <div className="p-3 space-y-2">
                {pharmaciesQuery.isLoading
                  ? [1,2,3,4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                  : pharmaciesQuery.data?.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        mapRef.current?.setView([p.latitude, p.longitude], 16);
                      }}
                    >
                      <div className={cn("flex items-start gap-2.5", isRTL && "flex-row-reverse")}>
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <Pill className="w-4 h-4 text-blue-700" />
                        </div>
                        <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                          <div className={cn("flex items-center gap-1.5 flex-wrap", isRTL && "flex-row-reverse")}>
                            <p className="text-sm font-semibold truncate">{p.name}</p>
                            {p.is_open_24h && (
                              <Badge className="text-[10px] h-4 bg-emerald-600 px-1.5">24h</Badge>
                            )}
                          </div>
                          {p.address && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">📍 {p.address}</p>
                          )}
                          <div className={cn("flex items-center gap-2 mt-1 flex-wrap", isRTL && "flex-row-reverse")}>
                            <span className="text-xs font-semibold text-primary">
                              {kmLabel(p.distance_km, ar)}
                            </span>
                            {p.phone && (
                              <a
                                href={`tel:${p.phone}`}
                                className={cn("flex items-center gap-1 text-xs text-blue-600 hover:underline", isRTL && "flex-row-reverse")}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="w-3 h-3" />{p.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ── PRESCRIPTION FINDER tab ── */}
            {tab === "prescription" && (
              <div className="p-3 space-y-3">
                {/* Step 1: Select prescription */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {ar ? "اختر الوصفة الطبية" : "Step 1 — Select prescription"}
                  </p>
                  {prescriptionsQuery.isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedPrescriptionId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSelectedPrescriptionId(v ? parseInt(v) : null);
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-8 appearance-none"
                        dir={isRTL ? "rtl" : "ltr"}
                      >
                        <option value="">{ar ? "اختر وصفة..." : "Choose a prescription..."}</option>
                        {prescriptionsQuery.data?.map((rx) => (
                          <option key={rx.id} value={rx.id}>
                            {ar ? "وصفة" : "Rx"} #{rx.id} · {rx.items.length} {ar ? "أدوية" : "meds"} · {rx.status}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Step 2: Choose which medications */}
                {selectedPrescription && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {ar ? "اختر الأدوية للبحث عنها" : "Step 2 — Select medications to find"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {ar
                        ? "يمكنك اختيار أدوية نادرة فقط للبحث عنها في الصيدليات"
                        : "Tip: uncheck common meds and only check rare ones to find specialized pharmacies"}
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {selectedPrescription.items.map((item) => {
                        const checked = selectedMedIds.includes(item.medicationId);
                        return (
                          <label
                            key={item.id}
                            className={cn(
                              "flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors",
                              isRTL && "flex-row-reverse",
                              checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMed(item.medicationId)}
                              className="shrink-0"
                            />
                            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                              <p className="text-sm font-medium truncate">
                                {item.medicationName ?? `Med #${item.medicationId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.dosage} · {item.frequency}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className={cn("flex gap-2 pt-1", isRTL && "flex-row-reverse")}>
                      <Button
                        size="sm"
                        className="gap-1.5 flex-1"
                        onClick={handleCheck}
                        disabled={selectedMedIds.length === 0 || isChecking}
                      >
                        {isChecking
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{ar ? "جارٍ البحث..." : "Searching..."}</>
                          : <><Search className="w-3.5 h-3.5" />{ar ? "ابحث عن الصيدليات" : "Find Pharmacies"}</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedMedIds(selectedPrescription.items.map((i) => i.medicationId));
                        }}
                        className="text-xs"
                      >
                        {ar ? "الكل" : "All"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Results */}
                {checkTriggered && checkResults.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {ar ? "نتائج البحث" : "Step 3 — Results"}
                    </p>
                    <div className="space-y-1.5">
                      {checkResults.map((p) => (
                        <div
                          key={p.id}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            p.hasAll
                              ? "border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50"
                              : p.hasSome
                              ? "border-amber-300 bg-amber-50/50 hover:bg-amber-50"
                              : "border-red-200 bg-red-50/30 hover:bg-red-50/50"
                          )}
                          onClick={() => {
                            mapRef.current?.setView([p.latitude, p.longitude], 16);
                          }}
                        >
                          <div className={cn("flex items-start gap-2", isRTL && "flex-row-reverse")}>
                            <div className="shrink-0 mt-0.5">
                              {p.hasAll
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                : p.hasSome
                                ? <AlertCircle className="w-4 h-4 text-amber-600" />
                                : <XCircle className="w-4 h-4 text-red-500" />
                              }
                            </div>
                            <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                              <div className={cn("flex items-center gap-2 justify-between", isRTL && "flex-row-reverse")}>
                                <p className="text-sm font-semibold truncate">{p.name}</p>
                                <span className="text-xs font-semibold text-primary shrink-0">
                                  {kmLabel(p.distance_km, ar)}
                                </span>
                              </div>
                              <p className={cn("text-xs mt-0.5", p.hasAll ? "text-emerald-700" : p.hasSome ? "text-amber-700" : "text-red-600")}>
                                {p.hasAll
                                  ? (ar ? "✓ جميع الأدوية متوفرة" : "✓ All medications available")
                                  : p.hasSome
                                  ? (ar ? `${p.available_count} من ${p.total_requested} أدوية متوفرة` : `${p.available_count} of ${p.total_requested} available`)
                                  : (ar ? "✗ لا توجد أدوية متوفرة" : "✗ No medications available")}
                              </p>
                              {p.address && (
                                <p className="text-xs text-muted-foreground truncate">📍 {p.address}</p>
                              )}
                              {p.phone && (
                                <a
                                  href={`tel:${p.phone}`}
                                  className={cn("flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5", isRTL && "flex-row-reverse")}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone className="w-3 h-3" />{p.phone}
                                </a>
                              )}
                              {p.is_open_24h && (
                                <Badge className="text-[10px] h-4 bg-emerald-600 px-1.5 mt-1">24h</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {checkTriggered && !isChecking && checkResults.length === 0 && selectedPrescriptionId && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <XCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {ar ? "لم يتم العثور على صيدليات توفر هذه الأدوية" : "No pharmacies found stocking these medications"}
                  </div>
                )}

                {!selectedPrescriptionId && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Search className="w-7 h-7 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {ar
                        ? "اختر وصفتك الطبية لمعرفة أقرب صيدلية توفر جميع الأدوية"
                        : "Select your prescription to find the nearest pharmacy with all your medications"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── OUR CLINIC tab ── */}
            {tab === "clinic" && (
              <div className="p-4 space-y-4">
                {clinicLat != null && clinicLng != null ? (
                  <>
                    {/* Clinic identity card */}
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20 dark:border-emerald-800 p-4 space-y-3">
                      <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
                        <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 text-2xl shadow-sm">
                          🏥
                        </div>
                        <div className={cn(isRTL && "text-right")}>
                          <p className="font-bold text-base leading-tight">{clinicName}</p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                            {ar ? "المركز الطبي" : "Medical Center"}
                          </p>
                        </div>
                      </div>

                      {(clinicAddress || clinicCity || clinicCountry) && (
                        <div className={cn("flex items-start gap-2", isRTL && "flex-row-reverse")}>
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div className={cn("text-sm", isRTL && "text-right")}>
                            {clinicAddress && <p className="font-medium">{clinicAddress}</p>}
                            {(clinicCity || clinicCountry) && (
                              <p className="text-muted-foreground text-xs mt-0.5">
                                {[clinicCity, clinicCountry].filter(Boolean).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className={cn("flex items-center gap-2 pt-1", isRTL && "flex-row-reverse")}>
                        <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-2 py-0.5">
                          {clinicLat.toFixed(5)}, {clinicLng.toFixed(5)}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2">
                      <a
                        href={`https://www.google.com/maps?q=${clinicLat},${clinicLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors px-3 py-2.5 text-sm font-medium"
                      >
                        <Navigation className="w-4 h-4 text-primary" />
                        {ar ? "الحصول على الاتجاهات ↗" : "Get Directions ↗"}
                      </a>
                      <button
                        className="flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors px-3 py-2.5 text-sm font-medium"
                        onClick={() => {
                          mapRef.current?.setView([clinicLat!, clinicLng!], 17);
                        }}
                      >
                        <MapPin className="w-4 h-4 text-primary" />
                        {ar ? "تكبير الموقع على الخريطة" : "Zoom to location"}
                      </button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                      {ar
                        ? "انقر على الدبوس على الخريطة لعرض التفاصيل"
                        : "Click the pin on the map to see details"}
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
                    <Building2 className="w-10 h-10 mx-auto text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {ar ? "لم يتم تحديد موقع العيادة بعد" : "Clinic location not configured yet"}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {ar
                        ? "يمكن للمسؤول تحديد الموقع من صفحة الإعدادات"
                        : "An admin can set the location in Settings → Location"}
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Legend footer */}
          <div className={cn("px-3 py-2 border-t border-border bg-muted/20 shrink-0 text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap", isRTL && "flex-row-reverse")}>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" />{ar ? "طبيب" : "Doctor"}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />{ar ? "صيدلية" : "Pharmacy"}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />{ar ? "جزئي" : "Partial"}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />{ar ? "غير متوفر" : "Not avail."}</span>
          </div>
        </div>

        {/* Map panel */}
        <div className="flex-1 relative overflow-hidden">
          {!userLocation && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 text-center p-6">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {ar ? "جارٍ تحديد موقعك..." : "Detecting your location..."}
                </p>
              </div>
            </div>
          )}
          <div ref={mapDivRef} className="w-full h-full" style={{ minHeight: "400px" }} />
        </div>
      </div>
    </div>
  );
}
