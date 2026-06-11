import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles, ChevronDown, ChevronUp, AlertTriangle, FlaskConical,
  Scan, Radiation, Waves, Heart, Activity, Pill, Loader2,
  CheckCircle, Info, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DiagnosisResult {
  possibleDiagnoses: Array<{
    name: string;
    icdCode: string;
    likelihood: "high" | "medium" | "low";
    reasoning: string;
  }>;
  recommendedTests: Array<{
    type: string;
    name: string;
    reason: string;
    priority: "stat" | "urgent" | "routine";
  }>;
  clinicalPearls: string[];
  redFlags: string[];
  confidenceLevel: "high" | "medium" | "low";
  disclaimer: string;
}

interface PrescriptionResult {
  suggestedMedications: Array<{
    name: string;
    genericName: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: string;
    reason: string;
    priority: "essential" | "recommended" | "optional";
  }>;
  modifications: Array<{
    currentMed: string;
    suggestion: string;
    reason: string;
    type: string;
  }>;
  interactions: Array<{
    drugs: string[];
    severity: "major" | "moderate" | "minor";
    description: string;
    recommendation: string;
  }>;
  allergyAlerts: string[];
  generalAdvice: string;
  disclaimer: string;
}

const LIKELIHOOD_COLOR = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const PRIORITY_COLOR = {
  stat: "bg-red-100 text-red-700",
  urgent: "bg-amber-100 text-amber-700",
  routine: "bg-blue-100 text-blue-700",
};

const INTERACTION_COLOR = {
  major: "bg-red-50 border-red-200 text-red-800",
  moderate: "bg-amber-50 border-amber-200 text-amber-800",
  minor: "bg-yellow-50 border-yellow-200 text-yellow-800",
};

const TEST_ICONS: Record<string, any> = {
  lab: FlaskConical,
  xray: Radiation,
  ct: Scan,
  mri: Scan,
  ultrasound: Waves,
  ecg: Heart,
  mammogram: Activity,
  other: Activity,
};

interface DiagnoseProps {
  chiefComplaint: string;
  vitals?: string;
  patient?: {
    dateOfBirth?: string | null;
    gender?: string | null;
    allergies?: string | null;
    longTermConditions?: string | null;
    currentMedications?: string | null;
  };
  onAddOrder?: (type: string, name: string) => void;
}

export function AiDiagnosePanel({ chiefComplaint, vitals, patient, onAddOrder }: DiagnoseProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : undefined;

  const mutation = useMutation({
    mutationFn: () => apiFetch<DiagnosisResult>("/ai/diagnose", {
      method: "POST",
      body: JSON.stringify({
        chiefComplaint,
        vitals: vitals || undefined,
        patientAge: age,
        patientGender: patient?.gender || undefined,
        patientAllergies: patient?.allergies || undefined,
        longTermConditions: patient?.longTermConditions || undefined,
        currentMedications: patient?.currentMedications || undefined,
      }),
    }),
    onSuccess: (data) => { setResult(data); setOpen(true); },
  });

  if (!user?.aiAssistantEnabled) return null;
  if (!chiefComplaint.trim()) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-amber-800">AI Diagnostic Assistant</span>
          <Badge className="bg-amber-100 text-amber-700 text-[10px] py-0">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button onClick={() => setOpen(!open)} className="text-amber-600 hover:text-amber-800">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs h-7"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin mr-1" />Analyzing...</>
            ) : (
              <><Zap className="w-3 h-3 mr-1" />{result ? "Re-analyze" : "Analyze"}</>
            )}
          </Button>
        </div>
      </div>

      {mutation.isError && (
        <div className="px-3 pb-3">
          <p className="text-xs text-destructive">{(mutation.error as Error).message}</p>
        </div>
      )}

      {result && open && (
        <div className="px-3 pb-4 space-y-4 border-t border-amber-200 pt-3">
          {result.redFlags.length > 0 && (
            <div className="flex gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 mb-1">Red Flags</p>
                <ul className="text-xs text-red-700 space-y-0.5">
                  {result.redFlags.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-amber-800 mb-2">Possible Diagnoses</p>
            <div className="space-y-2">
              {result.possibleDiagnoses.map((d, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-white border border-amber-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-800">{d.name}</p>
                    <Badge className={cn("text-[10px] shrink-0", LIKELIHOOD_COLOR[d.likelihood])}>
                      {d.likelihood} likelihood
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{d.icdCode}</p>
                  <p className="text-xs text-slate-600 mt-1">{d.reasoning}</p>
                </div>
              ))}
            </div>
          </div>

          {result.recommendedTests.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-2">Recommended Tests</p>
              <div className="space-y-1.5">
                {result.recommendedTests.map((t, i) => {
                  const Icon = TEST_ICONS[t.type] ?? Activity;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-amber-100">
                      <Icon className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium">{t.name}</p>
                          <Badge className={cn("text-[10px] py-0", PRIORITY_COLOR[t.priority])}>{t.priority}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t.reason}</p>
                      </div>
                      {onAddOrder && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1.5 text-primary hover:bg-primary/10"
                          onClick={() => onAddOrder(t.type, t.name)}
                        >
                          + Add
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.clinicalPearls.length > 0 && (
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Clinical Notes
              </p>
              <ul className="text-xs text-blue-700 space-y-0.5">
                {result.clinicalPearls.map((p, i) => <li key={i}>• {p}</li>)}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

interface PrescriptionAssistProps {
  diagnosis: string;
  chiefComplaint?: string;
  patient?: {
    dateOfBirth?: string | null;
    gender?: string | null;
    allergies?: string | null;
    longTermConditions?: string | null;
    currentMedications?: string | null;
  };
  currentRxItems?: Array<{ name: string; dosage?: string; frequency?: string; duration?: string }>;
  onAddMedication?: (med: { name: string; dosage: string; frequency: string; duration: string }) => void;
}

export function AiPrescriptionPanel({ diagnosis, chiefComplaint, patient, currentRxItems, onAddMedication }: PrescriptionAssistProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PrescriptionResult | null>(null);

  const age = patient?.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : undefined;

  const mutation = useMutation({
    mutationFn: () => apiFetch<PrescriptionResult>("/ai/prescription-assist", {
      method: "POST",
      body: JSON.stringify({
        diagnosis,
        chiefComplaint: chiefComplaint || undefined,
        patientAge: age,
        patientGender: patient?.gender || undefined,
        patientAllergies: patient?.allergies || undefined,
        longTermConditions: patient?.longTermConditions || undefined,
        currentMedications: patient?.currentMedications || undefined,
        currentRxItems: currentRxItems || [],
      }),
    }),
    onSuccess: (data) => { setResult(data); setOpen(true); },
  });

  if (!user?.aiAssistantEnabled) return null;
  if (!diagnosis.trim()) return null;

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/60">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-purple-800">AI Prescription Assistant</span>
          <Badge className="bg-purple-100 text-purple-700 text-[10px] py-0">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button onClick={() => setOpen(!open)} className="text-purple-600 hover:text-purple-800">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-100 text-xs h-7"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin mr-1" />Analyzing...</>
            ) : (
              <><Sparkles className="w-3 h-3 mr-1" />{result ? "Re-analyze" : "Get suggestions"}</>
            )}
          </Button>
        </div>
      </div>

      {mutation.isError && (
        <div className="px-3 pb-3">
          <p className="text-xs text-destructive">{(mutation.error as Error).message}</p>
        </div>
      )}

      {result && open && (
        <div className="px-3 pb-4 space-y-4 border-t border-purple-200 pt-3">
          {result.allergyAlerts.length > 0 && (
            <div className="flex gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 mb-1">Allergy Alerts</p>
                <ul className="text-xs text-red-700 space-y-0.5">
                  {result.allergyAlerts.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              </div>
            </div>
          )}

          {result.interactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-2">Drug Interactions</p>
              {result.interactions.map((int, i) => (
                <div key={i} className={cn("p-2.5 rounded-lg border mb-1.5 text-xs", INTERACTION_COLOR[int.severity])}>
                  <p className="font-semibold">{int.severity.toUpperCase()}: {int.drugs.join(" + ")}</p>
                  <p className="mt-0.5">{int.description}</p>
                  <p className="mt-0.5 font-medium">→ {int.recommendation}</p>
                </div>
              ))}
            </div>
          )}

          {result.suggestedMedications.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-2">Suggested Medications</p>
              <div className="space-y-2">
                {result.suggestedMedications.map((med, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-white border border-purple-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{med.name}</p>
                          <span className="text-[11px] text-muted-foreground">({med.genericName})</span>
                          <Badge className={cn("text-[10px] py-0",
                            med.priority === "essential" ? "bg-emerald-100 text-emerald-700" :
                            med.priority === "recommended" ? "bg-blue-100 text-blue-700" :
                            "bg-slate-100 text-slate-600"
                          )}>{med.priority}</Badge>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {med.dosage} · {med.frequency} · {med.duration} · {med.route}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{med.reason}</p>
                      </div>
                      {onAddMedication && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2 text-purple-600 hover:bg-purple-100 shrink-0"
                          onClick={() => onAddMedication({
                            name: med.name,
                            dosage: med.dosage,
                            frequency: med.frequency,
                            duration: med.duration,
                          })}
                        >
                          + Add
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.modifications.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-2">Suggested Modifications</p>
              {result.modifications.map((m, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 mb-1.5">
                  <p className="text-xs font-medium text-amber-800">{m.currentMed} → {m.suggestion}</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">{m.reason}</p>
                </div>
              ))}
            </div>
          )}

          {result.generalAdvice && (
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> General Advice
              </p>
              <p className="text-xs text-blue-700">{result.generalAdvice}</p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
