import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
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
import { cn } from "@/lib/utils";

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

function AddPatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t, isRTL } = useI18n();
  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "",
    dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/patients", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: t("patientRegistered") });
      onOpenChange(false);
      setForm({ firstName: "", lastName: "", phone: "", email: "", gender: "", bloodType: "", dateOfBirth: "", nationalId: "", allergies: "", medicalNotes: "", address: "" });
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className={cn(isRTL && "text-right")}>{t("registerNewPatient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("firstName")} *</Label>
              <Input className="mt-1" value={form.firstName} onChange={f("firstName")} />
            </div>
            <div>
              <Label className="text-xs">{t("lastName")} *</Label>
              <Input className="mt-1" value={form.lastName} onChange={f("lastName")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("phone")}</Label>
              <Input className="mt-1" value={form.phone} onChange={f("phone")} dir="ltr" />
            </div>
            <div>
              <Label className="text-xs">{t("email")}</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={f("email")} dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("gender")}</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("select")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t("male")}</SelectItem>
                  <SelectItem value="female">{t("female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("bloodType")}</Label>
              <Select onValueChange={(v) => setForm((p) => ({ ...p, bloodType: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("select")} />
                </SelectTrigger>
                <SelectContent>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("dateOfBirth")}</Label>
              <Input className="mt-1" type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} dir="ltr" />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("nationalId")}</Label>
            <Input className="mt-1" value={form.nationalId} onChange={f("nationalId")} dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">{t("knownAllergies")}</Label>
            <Input className="mt-1" value={form.allergies} onChange={f("allergies")} placeholder={t("allergiesPlaceholder")} />
          </div>
          <div>
            <Label className="text-xs">{t("medicalNotes")}</Label>
            <Textarea className="mt-1" rows={3} value={form.medicalNotes} onChange={f("medicalNotes")} />
          </div>
          <div>
            <Label className="text-xs">{t("address")}</Label>
            <Input className="mt-1" value={form.address} onChange={f("address")} />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate(form)}
            disabled={!form.firstName || !form.lastName || mutation.isPending}
          >
            {mutation.isPending ? t("registering") : t("registerPatient")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PatientsPage() {
  const { t, isRTL } = useI18n();
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
      <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">{t("patients")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{patients?.length ?? 0} {t("registeredPatients")}</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> {t("registerPatient")}
        </Button>
      </div>

      <div className="relative">
        <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
        <Input
          className={cn(isRTL ? "pr-9" : "pl-9")}
          placeholder={t("searchPatients")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          dir={isRTL ? "rtl" : "ltr"}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-2">
          {isLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
            : patients?.map((p) => {
                const age = p.dateOfBirth
                  ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
                  : null;
                return (
                  <Card
                    key={p.id}
                    className="border-border cursor-pointer hover:bg-accent/30 transition-colors"
                    onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  >
                    <CardContent className="p-4">
                      <div className={cn("flex items-start justify-between gap-2", isRTL && "flex-row-reverse")}>
                        <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div className={cn(isRTL && "text-right")}>
                            <p className="font-semibold text-sm">{p.firstName} {p.lastName}</p>
                            <p className="text-xs text-muted-foreground">
                              {age != null ? `${age} ${t("age")}` : ""}{" "}
                              {p.gender ? `· ${p.gender === "male" ? t("male") : t("female")}` : ""}
                            </p>
                          </div>
                        </div>
                        {p.bloodType && (
                          <Badge variant="outline" className="text-xs gap-1 shrink-0">
                            <Droplets className="w-3 h-3" />{p.bloodType}
                          </Badge>
                        )}
                      </div>
                      <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1", isRTL && "flex-row-reverse")}>
                        {p.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />{p.phone}
                          </span>
                        )}
                        {p.allergies && p.allergies !== "None" && p.allergies !== "لا يوجد" && (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {t("allergies")}: {p.allergies}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          {!isLoading && !patients?.length && (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                {t("noPatients")}
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          {selected && history ? (
            <Card className="border-border sticky top-0">
              <CardContent className="p-4 space-y-3">
                <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className={cn(isRTL && "text-right")}>
                    <p className="font-bold">{selected.firstName} {selected.lastName}</p>
                    <p className="text-xs text-muted-foreground">{selected.phone}</p>
                  </div>
                </div>
                {selected.allergies && selected.allergies !== "None" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <p className={cn("text-xs font-semibold text-amber-800 flex items-center gap-1", isRTL && "flex-row-reverse")}>
                      <AlertCircle className="w-3.5 h-3.5" /> {t("allergies")}
                    </p>
                    <p className={cn("text-xs text-amber-700 mt-0.5", isRTL && "text-right")}>{selected.allergies}</p>
                  </div>
                )}
                {selected.medicalNotes && (
                  <div>
                    <p className={cn("text-xs font-semibold text-muted-foreground", isRTL && "text-right")}>{t("medicalNotes")}</p>
                    <p className={cn("text-xs mt-0.5", isRTL && "text-right")}>{selected.medicalNotes}</p>
                  </div>
                )}
                <div>
                  <p className={cn("text-xs font-semibold text-muted-foreground mb-1", isRTL && "text-right")}>{t("visitHistory")}</p>
                  <p className={cn("text-xs", isRTL && "text-right")}>
                    {history.appointments?.length ?? 0} {t("appointments")} · {history.consultations?.length ?? 0} {t("consultations")}
                  </p>
                </div>
                {history.prescriptions?.length > 0 && (
                  <div>
                    <p className={cn("text-xs font-semibold text-muted-foreground mb-1", isRTL && "text-right")}>{t("recentPrescriptions")}</p>
                    {history.prescriptions.slice(-2).map((rx: any) => (
                      <div key={rx.id} className={cn("text-xs py-1 border-t border-border flex items-center justify-between", isRTL && "flex-row-reverse")}>
                        <span className="text-muted-foreground">{new Date(rx.issuedAt).toLocaleDateString(isRTL ? "ar-AE" : "en-AE")}</span>
                        <span>{rx.items?.length ?? 0} {t("medications")}</span>
                        <Badge variant={rx.status === "dispensed" ? "default" : "secondary"} className="text-xs ml-1">
                          {rx.status === "dispensed" ? t("dispensed") : t("pending")}
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
                {t("selectPatientHistory")}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AddPatientDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
