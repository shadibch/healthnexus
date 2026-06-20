import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
import { useI18n } from "@/lib/i18n";
import { useClinicSettings } from "@/lib/clinic-settings";
import { printPrescription } from "@/lib/print-prescription";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Pill, Clock, CheckCircle2, User, Stethoscope, MapPin, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface PrescriptionItem {
  id: number;
  medicationId: number;
  medicationName: string | null;
  dosage: string;
  frequency: string;
  duration: string | null;
  quantity: number;
  instructions: string | null;
}

interface Prescription {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  status: string;
  notes: string | null;
  issuedAt: string;
  dispensedAt: string | null;
  items: PrescriptionItem[];
}

export default function PrescriptionsPage() {
  const { role } = useRole();
  const { t, isRTL } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dispensing, setDispensing] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const clinic = useClinicSettings();

  const { data: prescriptions, isLoading } = useQuery<Prescription[]>({
    queryKey: ["prescriptions", statusFilter],
    queryFn: () => apiFetch(`/prescriptions${statusFilter !== "all" ? `?status=${statusFilter}` : ""}?limit=50`),
    refetchInterval: 20000,
  });

  const dispenseMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/prescriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dispensed", dispensedAt: new Date().toISOString() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: t("dispensedSuccessfully") });
      setDispensing(null);
    },
    onError: (e: Error) => {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
      setDispensing(null);
    },
  });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handlePrint = (rx: Prescription) => {
    printPrescription(
      {
        id: rx.id,
        patientName: rx.patientName,
        doctorName: rx.doctorName,
        issuedAt: rx.issuedAt,
        notes: rx.notes,
        items: rx.items,
      },
      { clinicName: clinic.clinicName, logoBase64: clinic.logoBase64 }
    );
  };

  const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending:   { label: t("pending"),   variant: "secondary",    icon: <Clock className="w-3 h-3" /> },
    dispensed: { label: t("dispensed"), variant: "default",      icon: <CheckCircle2 className="w-3 h-3" /> },
    cancelled: { label: t("cancelled"), variant: "destructive",  icon: null },
  };

  const pending = prescriptions?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">
            {role === "pharmacy" ? t("pendingRx") : t("prescriptions")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending > 0 ? `${pending} ${t("pendingDispensing")}` : t("allPrescriptions")}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">{t("pending")}</SelectItem>
            <SelectItem value="dispensed">{t("dispensed")}</SelectItem>
            <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
          : prescriptions?.length === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("noPrescriptions")}</p>
              </CardContent>
            </Card>
          )
          : prescriptions?.map((rx) => {
              const cfg = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending;
              const isExpanded = expanded.has(rx.id);
              const isPharmacy = role === "pharmacy";

              return (
                <Card key={rx.id} className="border-border">
                  <CardContent className="p-4">
                    <div className={cn("flex items-start justify-between gap-2", isRTL && "flex-row-reverse")}>
                      <div className={cn("flex items-start gap-3", isRTL && "flex-row-reverse")}>
                        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                          <FileText className="w-4.5 h-4.5 text-violet-600" />
                        </div>
                        <div className={cn(isRTL && "text-right")}>
                          <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                            <p className="font-semibold text-sm">Rx #{rx.id}</p>
                            <Badge variant={cfg.variant} className="text-xs gap-1">
                              {cfg.icon}{cfg.label}
                            </Badge>
                          </div>
                          <div className={cn("flex items-center gap-3 mt-0.5 flex-wrap", isRTL && "flex-row-reverse")}>
                            {rx.patientName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="w-3 h-3" />{rx.patientName}
                              </span>
                            )}
                            {rx.doctorName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" />{rx.doctorName}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(rx.issuedAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={cn("flex items-center gap-2 shrink-0 flex-wrap justify-end", isRTL && "flex-row-reverse")}>
                        {/* Pharmacy: Issue (dispense) + Print */}
                        {isPharmacy && rx.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setDispensing(rx.id);
                              dispenseMutation.mutate(rx.id);
                            }}
                            disabled={dispensing === rx.id}
                            className="text-xs"
                          >
                            {dispensing === rx.id ? "..." : t("dispense")}
                          </Button>
                        )}

                        {/* Print — always visible for pharmacy; visible to all other roles too */}
                        {rx.items.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("text-xs gap-1.5", isRTL && "flex-row-reverse")}
                            onClick={() => handlePrint(rx)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {isRTL ? "طباعة" : "Print"}
                          </Button>
                        )}

                        {/* Patient: find nearby pharmacy */}
                        {role === "patient" && rx.items.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50", isRTL && "flex-row-reverse")}
                            onClick={() => navigate("/map?tab=prescription")}
                          >
                            <MapPin className="w-3 h-3" />
                            {isRTL ? "أقرب صيدلية" : "Find Pharmacy"}
                          </Button>
                        )}

                        <Button size="sm" variant="ghost" onClick={() => toggleExpand(rx.id)} className="text-xs">
                          {isExpanded ? "↑" : `${rx.items.length} ${t("items")}`}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 pt-3 border-t border-border">
                        {rx.items.map((item) => (
                          <div key={item.id} className={cn("flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40", isRTL && "flex-row-reverse")}>
                            <Pill className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <div className={cn("flex-1", isRTL && "text-right")}>
                              <p className="text-sm font-medium">{item.medicationName ?? `Med #${item.medicationId}`}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.dosage} · {item.frequency}
                                {item.duration ? ` · ${item.duration}` : ""}
                                {" · "}{t("qty")}: {item.quantity}
                              </p>
                              {item.instructions && (
                                <p className="text-xs text-muted-foreground italic mt-0.5">{item.instructions}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {rx.notes && (
                          <p className={cn("text-xs text-muted-foreground italic px-1", isRTL && "text-right")}>
                            {t("note")}: {rx.notes}
                          </p>
                        )}
                        {rx.dispensedAt && (
                          <p className={cn("text-xs text-emerald-600 px-1", isRTL && "text-right")}>
                            {t("dispensed")} {formatDistanceToNow(new Date(rx.dispensedAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
