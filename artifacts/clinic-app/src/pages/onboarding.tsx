import { useState } from "react";
import { useClerk } from "@clerk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Stethoscope, Building2, User, ChevronRight, MapPin, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLERGIES = [
  "Penicillin", "Amoxicillin", "Aspirin", "Ibuprofen", "Sulfa drugs",
  "Codeine", "Morphine", "Latex", "Peanuts", "Tree nuts", "Shellfish",
  "Dairy", "Eggs", "Wheat / Gluten", "Soy", "Bee stings", "Iodine / Contrast dye",
];

const LONG_TERM_CONDITIONS = [
  "Diabetes (Type 1)", "Diabetes (Type 2)", "Hypertension", "Asthma",
  "COPD", "Coronary artery disease", "Heart failure", "Atrial fibrillation",
  "Hypothyroidism", "Hyperthyroidism", "Chronic kidney disease",
  "Liver disease", "Epilepsy", "Depression", "Anxiety disorder",
  "Rheumatoid arthritis", "Osteoporosis", "Obesity", "Cancer (specify in notes)",
  "HIV/AIDS", "Sickle cell disease",
];

// Staff roles that can be combined freely
const EXTRA_STAFF_ROLES: Array<{ id: string; en: string; ar: string; desc: string }> = [
  { id: "doctor",       en: "Doctor",        ar: "طبيب",          desc: "See patients, write consultations & prescriptions" },
  { id: "receptionist", en: "Receptionist",  ar: "موظف استقبال",  desc: "Manage appointments, queue & patient check-in" },
  { id: "pharmacist",   en: "Pharmacist",    ar: "صيدلاني",       desc: "Dispense medications and manage pharmacy stock" },
];

type Step = "role" | "admin-center" | "patient-profile";

export default function OnboardingPage() {
  const { user } = useAuth();
  const { signOut } = useClerk();
  const qc = useQueryClient();

  const initialStep: Step = user?.role === "admin" ? "admin-center"
    : user?.role === "patient" ? "patient-profile"
    : "role";

  const [step, setStep] = useState<Step>(initialStep);

  // ── Role selection ─────────────────────────────────────────────────────────
  // "staff" = picked the admin/medical center card; "patient" = patient card
  const [roleMode, setRoleMode] = useState<"staff" | "patient" | null>(null);
  // Extra staff roles (admin is always included in "staff" mode)
  const [extraRoles, setExtraRoles] = useState<Set<string>>(new Set(["doctor"])); // doctor ticked by default

  // ── Admin center form ──────────────────────────────────────────────────────
  const [centerName, setCenterName] = useState("");
  const [centerAddress, setCenterAddress] = useState("");

  // ── Patient form ───────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([""]);
  const [hasMedications, setHasMedications] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const roleMutation = useMutation({
    mutationFn: (roles: string[]) =>
      apiFetch("/users/onboarding/role", { method: "POST", body: JSON.stringify({ roles }) }),
    onSuccess: (_, roles) => {
      qc.invalidateQueries({ queryKey: ["auth-me"] });
      if (roles.includes("admin")) {
        setStep("admin-center");
      } else if (roles.includes("patient")) {
        setStep("patient-profile");
      }
      // non-admin staff who joined via invite → onboarding complete handled server-side
    },
  });

  const adminMutation = useMutation({
    mutationFn: (data: { centerName: string; address?: string }) =>
      apiFetch("/users/onboarding/admin", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth-me"] }),
  });

  const patientMutation = useMutation({
    mutationFn: (data: object) =>
      apiFetch("/users/onboarding/patient", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth-me"] }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function toggleExtraRole(id: string) {
    setExtraRoles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleRoleContinue() {
    if (!roleMode) return;
    if (roleMode === "patient") {
      roleMutation.mutate(["patient"]);
    } else {
      // staff mode: admin + selected extras
      const roles = ["admin", ...Array.from(extraRoles)];
      roleMutation.mutate(roles);
    }
  }

  function handleSubmitAdmin() {
    if (!centerName.trim()) return;
    adminMutation.mutate({ centerName: centerName.trim(), address: centerAddress || undefined });
  }

  function handleSubmitPatient() {
    if (!firstName.trim() || !lastName.trim()) return;
    const currentMedicationsStr = hasMedications
      ? medications.filter(m => m.trim()).join(", ")
      : "";
    patientMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dob || undefined,
      gender: gender || undefined,
      phone: phone || undefined,
      allergies: selectedAllergies.join(", ") || undefined,
      longTermConditions: selectedConditions.join(", ") || undefined,
      currentMedications: currentMedicationsStr || undefined,
    });
  }

  function toggleAllergy(a: string) {
    setSelectedAllergies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }
  function toggleCondition(c: string) {
    setSelectedConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-slate-800">HealthNexus</span>
        </div>

        {/* ── Step 1: Role selection ── */}
        {step === "role" && (
          <Card className="shadow-lg">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">Welcome! Let's get you set up</CardTitle>
              <CardDescription>Choose how you'll be using HealthNexus</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">

              {/* ── Medical center / staff card ── */}
              <div
                onClick={() => setRoleMode("staff")}
                className={cn(
                  "w-full rounded-xl border-2 text-left transition-all cursor-pointer",
                  roleMode === "staff"
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                )}
              >
                <div className="flex items-start gap-4 p-5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Medical Center Admin</p>
                    <p className="text-sm text-slate-500 mt-1">
                      Set up and manage your clinic. Invite doctors, pharmacists, and receptionists.
                    </p>
                  </div>
                </div>

                {/* Extra roles — only visible when staff card is selected */}
                {roleMode === "staff" && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="mx-5 mb-4 rounded-lg border border-emerald-200 bg-white divide-y divide-emerald-100"
                  >
                    <p className="px-4 py-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                      Also wear these hats? / هل تؤدي أدواراً إضافية؟
                    </p>
                    {EXTRA_STAFF_ROLES.map(r => (
                      <label
                        key={r.id}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-emerald-50/50 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={extraRoles.has(r.id)}
                          onCheckedChange={() => toggleExtraRole(r.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-slate-800">{r.en}</span>
                            <span className="text-sm text-slate-500" dir="rtl">{r.ar}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Patient card ── */}
              <button
                onClick={() => setRoleMode("patient")}
                className={cn(
                  "w-full p-5 rounded-xl border-2 text-left transition-all",
                  roleMode === "patient"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Patient</p>
                    <p className="text-sm text-slate-500 mt-1">Book appointments, view prescriptions, and manage your health records.</p>
                  </div>
                </div>
              </button>

              <Button
                className="w-full mt-2"
                disabled={!roleMode || roleMutation.isPending}
                onClick={handleRoleContinue}
              >
                {roleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>

              <button
                onClick={() => signOut()}
                className="w-full text-xs text-slate-400 hover:text-slate-600 text-center mt-2"
              >
                Sign out
              </button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2a: Admin center setup ── */}
        {step === "admin-center" && (
          <Card className="shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                Set up your Medical Center
              </CardTitle>
              <CardDescription>This creates your clinic workspace where staff can be added.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label htmlFor="centerName">Center Name *</Label>
                <Input
                  id="centerName"
                  placeholder="e.g. Al Noor Medical Center"
                  value={centerName}
                  onChange={e => setCenterName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="centerAddress" className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Address (optional)
                </Label>
                <Input
                  id="centerAddress"
                  placeholder="e.g. Sheikh Zayed Road, Dubai, UAE"
                  value={centerAddress}
                  onChange={e => setCenterAddress(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Button
                className="w-full mt-2"
                disabled={!centerName.trim() || adminMutation.isPending}
                onClick={handleSubmitAdmin}
              >
                {adminMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Medical Center <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {adminMutation.isError && (
                <p className="text-sm text-destructive text-center">{(adminMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 2b: Patient profile ── */}
        {step === "patient-profile" && (
          <Card className="shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Your Health Profile
              </CardTitle>
              <CardDescription>Help us keep your records accurate and your care safe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1" placeholder="First name" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1" placeholder="Last name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input id="dob" type="date" value={dob} onChange={e => setDob(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" placeholder="+971 50 000 0000" />
              </div>

              <div>
                <Label className="text-base font-semibold">Known Allergies</Label>
                <p className="text-xs text-muted-foreground mb-3">Select all that apply</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ALLERGIES.map(allergy => (
                    <label key={allergy} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                      <Checkbox checked={selectedAllergies.includes(allergy)} onCheckedChange={() => toggleAllergy(allergy)} />
                      <span className="text-sm">{allergy}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">Long-term Medical Conditions</Label>
                <p className="text-xs text-muted-foreground mb-3">Select all that apply</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {LONG_TERM_CONDITIONS.map(condition => (
                    <label key={condition} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded">
                      <Checkbox checked={selectedConditions.includes(condition)} onCheckedChange={() => toggleCondition(condition)} />
                      <span className="text-sm">{condition}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox id="hasMeds" checked={hasMedications} onCheckedChange={(v) => setHasMedications(!!v)} />
                  <Label htmlFor="hasMeds" className="text-base font-semibold cursor-pointer">
                    I am currently taking medications
                  </Label>
                </div>
                {hasMedications && (
                  <div className="space-y-2 mt-3">
                    {medications.map((med, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={med}
                          onChange={e => {
                            const updated = [...medications];
                            updated[idx] = e.target.value;
                            setMedications(updated);
                          }}
                          placeholder={`Medication ${idx + 1} (e.g. Metformin 500mg)`}
                        />
                        {medications.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => setMedications(medications.filter((_, i) => i !== idx))}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setMedications([...medications, ""])} className="gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add another
                    </Button>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                disabled={!firstName.trim() || !lastName.trim() || patientMutation.isPending}
                onClick={handleSubmitPatient}
              >
                {patientMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Complete Setup <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              {patientMutation.isError && (
                <p className="text-sm text-destructive text-center">{(patientMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
