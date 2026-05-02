import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, User, Phone, Droplets, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  address: string | null;
  createdAt: string;
}

function PatientCard({ patient, onSelect }: { patient: Patient; onSelect: () => void }) {
  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <Card
      className="border-border cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {patient.firstName} {patient.lastName}
              </p>
              <p className="text-xs text-muted-foreground">
                {age != null ? `${age}y` : ""} {patient.gender ? `· ${patient.gender}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {patient.bloodType && (
              <Badge variant="outline" className="text-xs gap-1">
                <Droplets className="w-3 h-3" />
                {patient.bloodType}
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {patient.phone && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {patient.phone}
            </span>
          )}
          {patient.allergies && patient.allergies !== "None" && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Allergies: {patient.allergies}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "",
    dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/patients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Patient registered successfully" });
      onOpenChange(false);
      setForm({ firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "", dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Patient</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">First Name *</Label>
              <Input className="mt-1" value={form.firstName} onChange={f("firstName")} />
            </div>
            <div>
              <Label className="text-xs">Last Name *</Label>
              <Input className="mt-1" value={form.lastName} onChange={f("lastName")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={f("phone")} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={f("email")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Gender</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Blood Type</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, bloodType: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date of Birth</Label>
              <Input className="mt-1" type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} />
            </div>
          </div>
          <div>
            <Label className="text-xs">National ID</Label>
            <Input className="mt-1" value={form.nationalId} onChange={f("nationalId")} />
          </div>
          <div>
            <Label className="text-xs">Known Allergies</Label>
            <Input className="mt-1" value={form.allergies} onChange={f("allergies")} placeholder="e.g. Penicillin, None" />
          </div>
          <div>
            <Label className="text-xs">Medical Notes</Label>
            <Textarea className="mt-1" rows={3} value={form.medicalNotes} onChange={f("medicalNotes")} />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input className="mt-1" value={form.address} onChange={f("address")} />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate(form)}
            disabled={!form.firstName || !form.lastName || mutation.isPending}
          >
            {mutation.isPending ? "Registering..." : "Register Patient"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ["patients", search],
    queryFn: () => apiFetch(`/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  const { data: history } = useQuery({
    queryKey: ["patient-history", selectedId],
    queryFn: () => apiFetch<any>(`/patients/${selectedId}/history`),
    enabled: selectedId != null,
  });

  const selected = patients?.find((p) => p.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{patients?.length ?? 0} registered patients</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Register Patient
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-2">
          {isLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            : patients?.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                />
              ))}
          {!isLoading && !patients?.length && (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No patients found
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          {selected && history ? (
            <Card className="border-border sticky top-0">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">{selected.firstName} {selected.lastName}</p>
                    <p className="text-xs text-muted-foreground">{selected.phone}</p>
                  </div>
                </div>
                {selected.allergies && selected.allergies !== "None" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Allergies
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">{selected.allergies}</p>
                  </div>
                )}
                {selected.medicalNotes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Medical Notes</p>
                    <p className="text-xs mt-0.5">{selected.medicalNotes}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Visit History</p>
                  <p className="text-xs">{history.appointments?.length ?? 0} appointments · {history.consultations?.length ?? 0} consultations</p>
                </div>
                {history.prescriptions?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Recent Prescriptions</p>
                    {history.prescriptions.slice(-2).map((rx: any) => (
                      <div key={rx.id} className="text-xs py-1 border-t border-border">
                        <span className="text-muted-foreground">{new Date(rx.issuedAt).toLocaleDateString()}</span>
                        {" · "}{rx.items?.length ?? 0} medications
                        <Badge variant={rx.status === "dispensed" ? "default" : "secondary"} className="ml-1 text-xs">
                          {rx.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Select a patient to view their history
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AddPatientDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
