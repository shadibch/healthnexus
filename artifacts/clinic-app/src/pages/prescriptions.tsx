import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useRole } from "@/lib/role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FileText, Pill, Clock, CheckCircle2, User, Stethoscope } from "lucide-react";
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

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "Pending", variant: "secondary", icon: <Clock className="w-3 h-3" /> },
  dispensed: { label: "Dispensed", variant: "default", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "Cancelled", variant: "destructive", icon: null },
};

function PrescriptionCard({
  rx,
  onDispense,
  dispensing,
  role,
}: {
  rx: Prescription;
  onDispense?: () => void;
  dispensing: boolean;
  role: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[rx.status] ?? STATUS_CONFIG.pending;

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
              <FileText className="w-4.5 h-4.5 text-violet-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">Rx #{rx.id}</p>
                <Badge variant={cfg.variant} className="text-xs gap-1">
                  {cfg.icon}
                  {cfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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
          <div className="flex items-center gap-2 shrink-0">
            {role === "pharmacy" && rx.status === "pending" && (
              <Button size="sm" onClick={onDispense} disabled={dispensing} className="text-xs">
                {dispensing ? "..." : "Dispense"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? "Less" : `${rx.items.length} items`}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border">
            {rx.items.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40">
                <Pill className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.medicationName ?? `Med #${item.medicationId}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.dosage} · {item.frequency}
                    {item.duration ? ` · ${item.duration}` : ""}
                    {" · "}Qty: {item.quantity}
                  </p>
                  {item.instructions && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">{item.instructions}</p>
                  )}
                </div>
              </div>
            ))}
            {rx.notes && (
              <p className="text-xs text-muted-foreground italic px-1">Note: {rx.notes}</p>
            )}
            {rx.dispensedAt && (
              <p className="text-xs text-emerald-600 px-1">
                Dispensed {formatDistanceToNow(new Date(rx.dispensedAt), { addSuffix: true })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PrescriptionsPage() {
  const { role } = useRole();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dispensing, setDispensing] = useState<number | null>(null);

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
      toast({ title: "Prescription dispensed successfully" });
      setDispensing(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDispensing(null);
    },
  });

  const pending = prescriptions?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {role === "pharmacy" ? "Pending Prescriptions" : "Prescriptions"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending > 0 ? `${pending} pending dispensing` : "All prescriptions"}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="dispensed">Dispensed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
                <p className="text-sm text-muted-foreground">No prescriptions found</p>
              </CardContent>
            </Card>
          )
          : prescriptions?.map((rx) => (
              <PrescriptionCard
                key={rx.id}
                rx={rx}
                role={role}
                dispensing={dispensing === rx.id}
                onDispense={() => {
                  setDispensing(rx.id);
                  dispenseMutation.mutate(rx.id);
                }}
              />
            ))}
      </div>
    </div>
  );
}
