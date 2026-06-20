import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useClinicSettings } from "@/lib/clinic-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  FileText,
  ShieldCheck,
  Printer,
  User,
  Stethoscope,
  CircleDollarSign,
} from "lucide-react";

interface ActivityRow {
  id: number;
  activityCode: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface Claim {
  id: number;
  patientId: number;
  doctorId: number;
  patientName: string | null;
  patientNationalId: string | null;
  patientPhone: string | null;
  doctorName: string | null;
  doctorCategory: string | null;
  consultationFeeApplied: string | null;
  encounterType: string;
  diagnosis: string | null;
  chiefComplaint: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  paidAmount: string | null;
  insuranceCompany: string | null;
  insuranceAmount: string | null;
  activityTotal: string;
  activities: ActivityRow[];
  createdAt: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function BillingPage() {
  const { lang, isRTL } = useI18n();
  const ar = lang === "ar";
  const { clinicName, logoBase64 } = useClinicSettings();
  const printRef = useRef<HTMLDivElement>(null);

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [selectedClaims, setSelectedClaims] = useState<number[]>([]);

  const { data: claims, isLoading } = useQuery<Claim[]>({
    queryKey: ["billing-claims", from, to],
    queryFn: () => apiFetch(`/billing/claims?status=partial&from=${from}&to=${to}`),
  });

  const allIds = claims?.map((c) => c.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedClaims.includes(id));

  const toggleAll = () => setSelectedClaims(allSelected ? [] : allIds);
  const toggleOne = (id: number) =>
    setSelectedClaims((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selectedData = claims?.filter((c) => selectedClaims.includes(c.id)) ?? [];
  const grandInsurance = selectedData.reduce((s, c) => s + parseFloat(c.insuranceAmount ?? "0"), 0);

  const handlePrint = () => window.print();

  const groupByCompany = selectedData.reduce<Record<string, Claim[]>>((acc, c) => {
    const co = c.insuranceCompany ?? "Unknown";
    if (!acc[co]) acc[co] = [];
    acc[co].push(c);
    return acc;
  }, {});

  return (
    <div className={cn("space-y-5 max-w-5xl", isRTL && "font-arabic")} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={cn("flex items-center justify-between flex-wrap gap-3", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-xl font-bold">{ar ? "الفوترة للتأمين" : "Insurance Billing"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar ? "إدارة مطالبات التأمين الشهرية" : "Manage monthly insurance claims"}
          </p>
        </div>
        {selectedClaims.length > 0 && (
          <Button onClick={handlePrint} className="gap-2 print:hidden">
            <Printer className="w-4 h-4" />
            {ar ? `طباعة فاتورة (${selectedClaims.length})` : `Print Invoice (${selectedClaims.length})`}
          </Button>
        )}
      </div>

      {/* Date range filter */}
      <Card className="print:hidden">
        <CardContent className="p-4">
          <div className={cn("flex items-end gap-4 flex-wrap", isRTL && "flex-row-reverse")}>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{ar ? "من" : "From"}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{ar ? "إلى" : "To"}</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" dir="ltr" />
            </div>
            <div className={cn("text-sm text-muted-foreground pb-1.5", isRTL && "mr-auto")}>
              {claims ? (
                <span>
                  {ar ? `${claims.length} مطالبة` : `${claims.length} claim${claims.length !== 1 ? "s" : ""}`}
                  {claims.length > 0 && (
                    <span className="ml-2 text-amber-700 font-semibold">
                      · AED {claims.reduce((s, c) => s + parseFloat(c.insuranceAmount ?? "0"), 0).toFixed(2)}
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claims table */}
      <Card className="print:hidden">
        <CardHeader className="py-3 px-4">
          <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              {ar ? "مطالبات التأمين المعلقة" : "Pending Insurance Claims"}
            </CardTitle>
            {allIds.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                {allSelected ? (ar ? "إلغاء التحديد" : "Deselect all") : (ar ? "تحديد الكل" : "Select all")}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !claims?.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {ar ? "لا توجد مطالبات للفترة المحددة" : "No claims for the selected period"}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {claims.map((claim) => {
                const selected = selectedClaims.includes(claim.id);
                return (
                  <div
                    key={claim.id}
                    onClick={() => toggleOne(claim.id)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                      isRTL && "flex-row-reverse",
                      selected ? "bg-blue-50/50" : "hover:bg-muted/30"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOne(claim.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 shrink-0"
                    />
                    <div className={cn("flex-1 min-w-0 space-y-1", isRTL && "text-right")}>
                      <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                        <span className="font-semibold text-sm">{claim.patientName}</span>
                        <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                          <ShieldCheck className="w-2.5 h-2.5 mr-1" />
                          {claim.insuranceCompany ?? "—"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(claim.createdAt).toLocaleDateString(isRTL ? "ar-AE" : "en-AE")}
                        </span>
                      </div>
                      <div className={cn("flex items-center gap-2 flex-wrap text-xs text-muted-foreground", isRTL && "flex-row-reverse")}>
                        <span className="flex items-center gap-1">
                          <Stethoscope className="w-3 h-3" />
                          {claim.doctorName}
                        </span>
                        {claim.doctorCategory && (
                          <Badge variant="secondary" className="text-xs font-normal py-0">
                            {claim.doctorCategory}
                          </Badge>
                        )}
                        {claim.diagnosis && <span>· {claim.diagnosis}</span>}
                      </div>
                      <div className={cn("flex items-center gap-3 flex-wrap text-xs", isRTL && "flex-row-reverse")}>
                        {claim.consultationFeeApplied && (
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <CircleDollarSign className="w-3 h-3" />
                            {ar ? "رسم الكشف:" : "Consult fee:"} AED {parseFloat(claim.consultationFeeApplied).toFixed(2)}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {ar ? "إجمالي الخدمات:" : "Services:"} AED {parseFloat(claim.activityTotal).toFixed(2)}
                        </span>
                        {claim.paidAmount && (
                          <span className="text-emerald-700">
                            {ar ? "مدفوع من المريض:" : "Patient paid:"} AED {parseFloat(claim.paidAmount).toFixed(2)}
                          </span>
                        )}
                        <span className="font-semibold text-blue-700">
                          {ar ? "يُطالب التأمين:" : "Insurance claim:"} AED {parseFloat(claim.insuranceAmount ?? "0").toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Printable Invoice ── */}
      {selectedData.length > 0 && (
        <div ref={printRef} className="print-only hidden print:block">
          {Object.entries(groupByCompany).map(([company, companyClaims]) => {
            const companyTotal = companyClaims.reduce((s, c) => s + parseFloat(c.insuranceAmount ?? "0"), 0);
            return (
              <div key={company} className="mb-16 page-break-after">
                {/* Invoice header */}
                <div className="border-b-2 border-slate-800 pb-4 mb-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {logoBase64 && (
                          <img src={logoBase64} alt="logo" className="w-8 h-8 rounded object-cover" />
                        )}
                        <h1 className="text-2xl font-bold text-slate-900">{clinicName}</h1>
                      </div>
                      <p className="text-sm text-slate-500">Hospital & Clinic Management · MEA Edition</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-700">INSURANCE INVOICE</p>
                      <p className="text-xs text-slate-500">Period: {from} — {to}</p>
                      <p className="text-xs text-slate-500">Printed: {new Date().toLocaleDateString("en-AE")}</p>
                    </div>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-blue-800">{company}</span>
                  </div>
                </div>

                {/* Claims */}
                {companyClaims.map((claim) => (
                  <div key={claim.id} className="mb-8 border border-slate-200 rounded-lg overflow-hidden">
                    {/* Claim header */}
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-900">{claim.patientName}</p>
                        <p className="text-xs text-slate-500">
                          {ar ? "الرقم الوطني:" : "National ID:"} {claim.patientNationalId ?? "—"} ·
                          {" "}{ar ? "الهاتف:" : "Phone:"} {claim.patientPhone ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {ar ? "الطبيب:" : "Doctor:"} {claim.doctorName}
                          {claim.doctorCategory && (
                            <span className="ml-1 text-slate-400">({claim.doctorCategory})</span>
                          )}
                          {" "}· {ar ? "التاريخ:" : "Date:"} {new Date(claim.createdAt).toLocaleDateString("en-AE")}
                        </p>
                        {claim.consultationFeeApplied && (
                          <p className="text-xs font-medium text-emerald-700 mt-0.5">
                            {ar ? "رسم الكشف:" : "Consultation Fee:"} AED {parseFloat(claim.consultationFeeApplied).toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-600">{ar ? "رقم السجل:" : "Encounter #"}{claim.id}</p>
                        {claim.diagnosis && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-xs">{ar ? "التشخيص:" : "Dx:"} {claim.diagnosis}</p>
                        )}
                      </div>
                    </div>

                    {/* Consultation fee line item (always shown as first row) */}
                    {claim.consultationFeeApplied && (
                      <table className="w-full text-xs border-b border-slate-100">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="text-left px-4 py-2 font-semibold text-slate-600">Code</th>
                            <th className="text-left px-4 py-2 font-semibold text-slate-600">Description</th>
                            <th className="text-center px-4 py-2 font-semibold text-slate-600">Qty</th>
                            <th className="text-right px-4 py-2 font-semibold text-slate-600">Unit (AED)</th>
                            <th className="text-right px-4 py-2 font-semibold text-slate-600">Total (AED)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-emerald-50/40">
                            <td className="px-4 py-2 font-mono text-slate-500 text-xs">CONSULT</td>
                            <td className="px-4 py-2 text-slate-800 font-medium">
                              {ar ? "رسم الكشف" : "Consultation Fee"}
                              {claim.doctorCategory && (
                                <span className="ml-1 text-slate-500 font-normal">— {claim.doctorCategory}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">1</td>
                            <td className="px-4 py-2 text-right">{parseFloat(claim.consultationFeeApplied).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right font-semibold">{parseFloat(claim.consultationFeeApplied).toFixed(2)}</td>
                          </tr>
                          {/* HAAD activity rows */}
                          {claim.activities.map((a) => (
                            <tr key={a.id} className="border-t border-slate-100">
                              <td className="px-4 py-2 font-mono text-slate-600">{a.activityCode}</td>
                              <td className="px-4 py-2 text-slate-800">{a.description}</td>
                              <td className="px-4 py-2 text-center">{a.quantity}</td>
                              <td className="px-4 py-2 text-right">{parseFloat(a.unitPrice).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-semibold">{parseFloat(a.total).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                          {claim.paidAmount && parseFloat(claim.paidAmount) > 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-1 text-right text-xs text-emerald-700 font-semibold">
                                {ar ? "مدفوع من المريض:" : "Patient paid:"}
                              </td>
                              <td className="px-4 py-1 text-right text-emerald-700 font-bold">
                                − AED {parseFloat(claim.paidAmount).toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t-2 border-blue-200">
                            <td colSpan={4} className="px-4 py-2 text-right text-sm font-bold text-blue-800">
                              {ar ? "المبلغ المطالب من التأمين:" : "Insurance claim amount:"}
                            </td>
                            <td className="px-4 py-2 text-right text-blue-800 font-bold text-sm">
                              AED {parseFloat(claim.insuranceAmount ?? "0").toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* Activities-only (no consult fee) */}
                    {!claim.consultationFeeApplied && claim.activities.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="text-left px-4 py-2 font-semibold text-slate-600">Code</th>
                            <th className="text-left px-4 py-2 font-semibold text-slate-600">Description</th>
                            <th className="text-center px-4 py-2 font-semibold text-slate-600">Qty</th>
                            <th className="text-right px-4 py-2 font-semibold text-slate-600">Unit (AED)</th>
                            <th className="text-right px-4 py-2 font-semibold text-slate-600">Total (AED)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claim.activities.map((a) => (
                            <tr key={a.id} className="border-b border-slate-100">
                              <td className="px-4 py-2 font-mono text-slate-600">{a.activityCode}</td>
                              <td className="px-4 py-2 text-slate-800">{a.description}</td>
                              <td className="px-4 py-2 text-center">{a.quantity}</td>
                              <td className="px-4 py-2 text-right">{parseFloat(a.unitPrice).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-semibold">{parseFloat(a.total).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50">
                          {claim.paidAmount && parseFloat(claim.paidAmount) > 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 py-1 text-right text-xs text-emerald-700 font-semibold">
                                {ar ? "مدفوع من المريض:" : "Patient paid:"}
                              </td>
                              <td className="px-4 py-1 text-right text-emerald-700 font-bold">
                                − AED {parseFloat(claim.paidAmount).toFixed(2)}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t-2 border-blue-200">
                            <td colSpan={4} className="px-4 py-2 text-right text-sm font-bold text-blue-800">
                              {ar ? "المبلغ المطالب من التأمين:" : "Insurance claim amount:"}
                            </td>
                            <td className="px-4 py-2 text-right text-blue-800 font-bold text-sm">
                              AED {parseFloat(claim.insuranceAmount ?? "0").toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {!claim.consultationFeeApplied && claim.activities.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400 italic">No coded activities recorded for this encounter.</p>
                    )}
                  </div>
                ))}

                {/* Company total */}
                <div className="border-t-2 border-slate-800 pt-4 flex justify-between items-center">
                  <p className="font-bold text-slate-800">
                    {ar ? "إجمالي المطالبات لـ" : "Total claims for"} {company}
                  </p>
                  <p className="text-xl font-bold text-blue-800">AED {companyTotal.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Screen invoice preview */}
      {selectedData.length > 0 && (
        <div className="print:hidden space-y-4">
          <h2 className={cn("text-base font-bold flex items-center gap-2", isRTL && "flex-row-reverse")}>
            <FileText className="w-4 h-4 text-blue-600" />
            {ar ? "معاينة الفاتورة" : "Invoice Preview"}
          </h2>
          {Object.entries(groupByCompany).map(([company, companyClaims]) => {
            const companyTotal = companyClaims.reduce((s, c) => s + parseFloat(c.insuranceAmount ?? "0"), 0);
            return (
              <Card key={company} className="border-blue-200">
                <CardHeader className="py-3 px-4 bg-blue-50/40 border-b border-blue-100">
                  <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
                    <CardTitle className={cn("text-sm font-bold flex items-center gap-2 text-blue-800", isRTL && "flex-row-reverse")}>
                      <ShieldCheck className="w-4 h-4" />
                      {company}
                    </CardTitle>
                    <span className="text-sm font-bold text-blue-800">AED {companyTotal.toFixed(2)}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {companyClaims.map((claim) => (
                    <div key={claim.id} className="px-4 py-3 border-b border-border last:border-0">
                      <div className={cn("flex justify-between items-start gap-2", isRTL && "flex-row-reverse")}>
                        <div className={cn("space-y-0.5 flex-1", isRTL && "text-right")}>
                          <div className={cn("flex items-center gap-2 text-sm font-semibold", isRTL && "flex-row-reverse")}>
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            {claim.patientName}
                          </div>
                          <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap", isRTL && "flex-row-reverse")}>
                            <Stethoscope className="w-3 h-3" />
                            <span>{claim.doctorName}</span>
                            {claim.doctorCategory && (
                              <Badge variant="secondary" className="text-xs font-normal py-0 h-4">
                                {claim.doctorCategory}
                              </Badge>
                            )}
                            <span>· {new Date(claim.createdAt).toLocaleDateString(isRTL ? "ar-AE" : "en-AE")}</span>
                          </div>
                          {claim.diagnosis && (
                            <p className="text-xs text-muted-foreground">{ar ? "تشخيص:" : "Dx:"} {claim.diagnosis}</p>
                          )}
                          {claim.consultationFeeApplied && (
                            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                              <CircleDollarSign className="w-3 h-3" />
                              {ar ? "رسم الكشف:" : "Consult fee:"} AED {parseFloat(claim.consultationFeeApplied).toFixed(2)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {claim.activities.length} {ar ? "خدمة" : "activities"} · AED {parseFloat(claim.activityTotal).toFixed(2)}
                          </p>
                        </div>
                        <div className={cn("text-right shrink-0", isRTL && "text-left")}>
                          {claim.paidAmount && (
                            <p className="text-xs text-emerald-700">
                              {ar ? "مريض:" : "Patient:"} AED {parseFloat(claim.paidAmount).toFixed(2)}
                            </p>
                          )}
                          <p className="text-sm font-bold text-blue-700">
                            {ar ? "تأمين:" : "Insurance:"} AED {parseFloat(claim.insuranceAmount ?? "0").toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          <div className={cn("flex justify-end items-center gap-4 py-3 border-t border-border", isRTL && "flex-row-reverse")}>
            <span className="text-sm text-muted-foreground">
              {ar ? "الإجمالي الكلي للتأمين:" : "Grand total to insurance:"}
            </span>
            <span className="text-lg font-bold text-blue-800">AED {grandInsurance.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
