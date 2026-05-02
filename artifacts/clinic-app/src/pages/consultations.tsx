import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Stethoscope, User, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Consultation {
  id: number;
  appointmentId: number | null;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatmentPlan: string | null;
  notes: string | null;
  vitals: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  in_progress: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending: "bg-blue-100 text-blue-800 border-blue-300",
};

export default function ConsultationsPage() {
  const { data: consultations, isLoading } = useQuery<Consultation[]>({
    queryKey: ["consultations"],
    queryFn: () => apiFetch("/consultations?limit=30"),
    refetchInterval: 20000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Consultations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {consultations?.length ?? 0} records
        </p>
      </div>

      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)
          : consultations?.length === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <Stethoscope className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No consultations yet</p>
              </CardContent>
            </Card>
          )
          : consultations?.map((c) => (
              <Card key={c.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">Consultation #{c.id}</p>
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[c.status] ?? ""}
                      >
                        {c.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3 flex-wrap">
                    {c.patientName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="w-3 h-3" />{c.patientName}
                      </span>
                    )}
                    {c.doctorName && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Stethoscope className="w-3 h-3" />{c.doctorName}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {c.chiefComplaint && (
                      <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                        <p className="text-xs font-semibold text-blue-700 mb-0.5">Chief Complaint</p>
                        <p className="text-sm text-blue-800">{c.chiefComplaint}</p>
                      </div>
                    )}
                    {c.diagnosis && (
                      <div className="p-2.5 rounded-lg bg-muted/40">
                        <p className="text-xs font-semibold text-muted-foreground mb-0.5">Diagnosis</p>
                        <p className="text-sm">{c.diagnosis}</p>
                      </div>
                    )}
                    {c.treatmentPlan && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                        <p className="text-xs font-semibold text-emerald-700 mb-0.5">Treatment Plan</p>
                        <p className="text-sm text-emerald-800">{c.treatmentPlan}</p>
                      </div>
                    )}
                    {c.vitals && (
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{c.vitals}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
