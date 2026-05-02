import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, User, Stethoscope, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Appointment {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  doctorName: string | null;
  scheduledAt: string;
  status: string;
  type: string;
  notes: string | null;
  queueNumber: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-gray-100 text-gray-700",
};

export default function AppointmentsPage() {
  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments"],
    queryFn: () => apiFetch("/appointments?limit=50"),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My Appointments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {appointments?.length ?? 0} appointments
        </p>
      </div>

      <div className="space-y-3">
        {isLoading
          ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
          : appointments?.length === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <CalendarClock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No appointments found</p>
              </CardContent>
            </Card>
          )
          : appointments?.map((a) => (
              <Card key={a.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">Appointment #{a.id}</p>
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[a.status] ?? ""}
                        >
                          {a.status.replace("_", " ")}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {a.type.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {a.patientName && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />{a.patientName}
                          </span>
                        )}
                        {a.doctorName && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" />{a.doctorName}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(a.scheduledAt).toLocaleTimeString("en-AE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {a.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">{a.notes}</p>
                      )}
                    </div>
                    {a.queueNumber && (
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                        #{a.queueNumber}
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
