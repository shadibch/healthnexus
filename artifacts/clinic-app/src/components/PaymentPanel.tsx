import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  Banknote,
  ShieldCheck,
  CircleDollarSign,
  Clock,
  CheckCircle2,
  Loader2,
  Receipt,
} from "lucide-react";

type PaymentStatus = "unpaid" | "paid" | "exempted" | "partial";
type PaymentMethod = "cash" | "card" | null;

interface PaymentData {
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paidAmount: string | null;
  insuranceCompany: string | null;
  insuranceAmount: string | null;
}

interface Props {
  consultationId: number;
  current: PaymentData;
  activityTotal: number;
  lang: string;
  isRTL: boolean;
  canEdit: boolean;
  queryKey: unknown[];
}

const STATUS_CONFIG: Record<PaymentStatus, { label: string; labelAr: string; icon: React.ReactNode; color: string }> = {
  unpaid:   { label: "Unpaid",   labelAr: "غير مدفوع",   icon: <Clock className="w-3 h-3" />,          color: "bg-red-100 text-red-700 border-red-300" },
  paid:     { label: "Paid",     labelAr: "مدفوع",       icon: <CheckCircle2 className="w-3 h-3" />,    color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  exempted: { label: "Exempted", labelAr: "معفى",        icon: <ShieldCheck className="w-3 h-3" />,     color: "bg-blue-100 text-blue-700 border-blue-300" },
  partial:  { label: "Partial",  labelAr: "جزئي",        icon: <CircleDollarSign className="w-3 h-3" />, color: "bg-amber-100 text-amber-700 border-amber-300" },
};

export default function PaymentPanel({ consultationId, current, activityTotal, lang, isRTL, canEdit, queryKey }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PaymentStatus>(current.paymentStatus);
  const [method, setMethod] = useState<PaymentMethod>(current.paymentMethod);
  const [paidAmt, setPaidAmt] = useState(current.paidAmount ?? "");
  const [insuranceCo, setInsuranceCo] = useState(current.insuranceCompany ?? "");
  const [insuranceAmt, setInsuranceAmt] = useState(current.insuranceAmount ?? "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const sc = STATUS_CONFIG[current.paymentStatus] ?? STATUS_CONFIG.unpaid;
  const ar = lang === "ar";

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/consultations/${consultationId}/payment`, {
        method: "PATCH",
        body: JSON.stringify({
          paymentStatus: status,
          paymentMethod: status === "exempted" ? null : method,
          paidAmount: status === "unpaid" || status === "exempted" ? null : paidAmt || null,
          insuranceCompany: status === "partial" ? insuranceCo || null : null,
          insuranceAmount: status === "partial" ? insuranceAmt || null : null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setOpen(false);
      toast({ title: ar ? "تم تسجيل الدفع" : "Payment recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleMethodSelect = (m: PaymentMethod) => {
    setMethod(m);
    if (m === "card") {
      setStatus("paid");
      if (!paidAmt && activityTotal > 0) setPaidAmt(activityTotal.toFixed(2));
    }
  };

  const handleStatusSelect = (s: PaymentStatus) => {
    setStatus(s);
    if (s === "exempted") setMethod(null);
    if (s === "paid" && activityTotal > 0 && !paidAmt) setPaidAmt(activityTotal.toFixed(2));
  };

  return (
    <>
      <Card className={cn("border", current.paymentStatus === "paid" ? "border-emerald-200" : current.paymentStatus === "partial" ? "border-amber-200" : current.paymentStatus === "exempted" ? "border-blue-200" : "border-red-200")}>
        <CardHeader className="py-3 px-4">
          <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <CardTitle className={cn("text-sm font-semibold flex items-center gap-2", isRTL && "flex-row-reverse")}>
              <Receipt className="w-4 h-4 text-slate-600" />
              {ar ? "الدفع والفوترة" : "Payment & Billing"}
            </CardTitle>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="text-xs gap-1.5 h-7">
                <CircleDollarSign className="w-3.5 h-3.5" />
                {ar ? "تسجيل الدفع" : "Record Payment"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className={cn("flex flex-wrap items-center gap-3", isRTL && "flex-row-reverse")}>
            {/* Status badge */}
            <Badge variant="outline" className={cn("gap-1 px-2 py-1 text-xs font-semibold border", sc.color)}>
              {sc.icon}
              {ar ? sc.labelAr : sc.label}
            </Badge>

            {/* Method badge */}
            {current.paymentMethod && (
              <Badge variant="secondary" className={cn("gap-1 text-xs", isRTL && "flex-row-reverse")}>
                {current.paymentMethod === "card"
                  ? <><CreditCard className="w-3 h-3" />{ar ? "بطاقة" : "Card"}</>
                  : <><Banknote className="w-3 h-3" />{ar ? "نقداً" : "Cash"}</>
                }
              </Badge>
            )}

            {/* Paid amount */}
            {current.paidAmount && parseFloat(current.paidAmount) > 0 && (
              <span className="text-xs font-semibold text-emerald-700">
                {ar ? "المدفوع:" : "Paid:"} AED {parseFloat(current.paidAmount).toFixed(2)}
              </span>
            )}

            {/* Insurance info */}
            {current.paymentStatus === "partial" && (
              <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                {current.insuranceCompany && (
                  <span className="text-xs text-blue-700 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {current.insuranceCompany}
                  </span>
                )}
                {current.insuranceAmount && (
                  <span className="text-xs text-blue-700">
                    {ar ? "التأمين:" : "Insurance:"} AED {parseFloat(current.insuranceAmount).toFixed(2)}
                  </span>
                )}
              </div>
            )}

            {/* Activity total */}
            {activityTotal > 0 && (
              <span className={cn("text-xs text-muted-foreground", isRTL ? "mr-auto" : "ml-auto")}>
                {ar ? "إجمالي الخدمات:" : "Total services:"} <span className="font-semibold text-foreground">AED {activityTotal.toFixed(2)}</span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
              <Receipt className="w-4 h-4" />
              {ar ? "تسجيل الدفع" : "Record Payment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Activity total summary */}
            {activityTotal > 0 && (
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">{ar ? "إجمالي الخدمات" : "Total services"}</span>
                <span className="font-bold text-base">AED {activityTotal.toFixed(2)}</span>
              </div>
            )}

            {/* Payment type */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {ar ? "نوع الدفع" : "Payment type"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(["paid", "partial", "exempted", "unpaid"] as PaymentStatus[]).map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleStatusSelect(s)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        isRTL && "flex-row-reverse",
                        status === s
                          ? cn("border-2", cfg.color.replace("bg-", "border-").split(" ")[0], cfg.color)
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      {cfg.icon}
                      {ar ? cfg.labelAr : cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment method (not for exempted) */}
            {status !== "exempted" && status !== "unpaid" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {ar ? "طريقة الدفع" : "Payment method"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleMethodSelect("cash")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all",
                      isRTL && "flex-row-reverse",
                      method === "cash"
                        ? "border-2 border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <Banknote className="w-4 h-4" />
                    {ar ? "نقداً" : "Cash"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMethodSelect("card")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all",
                      isRTL && "flex-row-reverse",
                      method === "card"
                        ? "border-2 border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <CreditCard className="w-4 h-4" />
                    {ar ? "بطاقة" : "Card"}
                  </button>
                </div>
                {method === "card" && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                    {ar
                      ? "الدفع بالبطاقة يُحدّد الحالة تلقائياً كـ «مدفوع»"
                      : "Card payment automatically marks status as Paid"}
                  </p>
                )}
              </div>
            )}

            {/* Amount paid (for paid / partial) */}
            {(status === "paid" || status === "partial") && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {status === "partial"
                    ? (ar ? "المبلغ المدفوع من المريض (AED)" : "Amount paid by patient (AED)")
                    : (ar ? "المبلغ المدفوع (AED)" : "Amount paid (AED)")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paidAmt}
                  onChange={(e) => setPaidAmt(e.target.value)}
                  placeholder="0.00"
                  dir="ltr"
                />
              </div>
            )}

            {/* Insurance fields (only for partial) */}
            {status === "partial" && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                <p className={cn("text-xs font-semibold text-blue-700 flex items-center gap-1.5", isRTL && "flex-row-reverse")}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {ar ? "معلومات شركة التأمين" : "Insurance details"}
                </p>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{ar ? "شركة التأمين" : "Insurance company"}</Label>
                  <Input
                    value={insuranceCo}
                    onChange={(e) => setInsuranceCo(e.target.value)}
                    placeholder={ar ? "مثال: الدار للتأمين" : "e.g. Daman, AXA, ADNIC"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{ar ? "المبلغ المستحق من التأمين (AED)" : "Amount to bill to insurance (AED)"}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={insuranceAmt}
                    onChange={(e) => setInsuranceAmt(e.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (status !== "exempted" && status !== "unpaid" && !method)
              }
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />{ar ? "جارٍ الحفظ..." : "Saving..."}</>
                : <><CheckCircle2 className="w-4 h-4" />{ar ? "حفظ الدفع" : "Save Payment"}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
