import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Package, AlertTriangle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StockItem {
  id: number;
  medicationId: number;
  medicationName: string | null;
  quantity: number;
  minimumQuantity: number;
  unitCost: string | null;
  expiryDate: string | null;
  batchNumber: string | null;
  isLowStock: boolean;
}

interface StockAlerts {
  totalLowStock: number;
  totalExpiringSoon: number;
}

function EditStockDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  const [qty, setQty] = useState(item?.quantity.toString() ?? "");
  const [minQty, setMinQty] = useState(item?.minimumQuantity.toString() ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/stock/${item!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: parseInt(qty), minimumQuantity: parseInt(minQty) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: t("stockUpdated") });
      onClose();
    },
    onError: (e: Error) => toast({ title: t("error"), description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={item != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("updateStock")}: {item?.medicationName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">{t("currentQuantity")}</Label>
            <Input className="mt-1" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("minimumQuantity")}</Label>
            <Input className="mt-1" type="number" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t("saving") : t("updateStock")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StockPage() {
  const { t, isRTL } = useI18n();
  const [filter, setFilter] = useState<string>("all");
  const [editItem, setEditItem] = useState<StockItem | null>(null);

  const { data: stock, isLoading } = useQuery<StockItem[]>({
    queryKey: ["stock", filter],
    queryFn: () => apiFetch(`/stock${filter === "low" ? "?lowStock=true" : ""}`),
    refetchInterval: 30000,
  });

  const { data: alerts } = useQuery<StockAlerts>({
    queryKey: ["stock-alerts"],
    queryFn: () => apiFetch("/stock/alerts"),
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center justify-between", isRTL && "flex-row-reverse")}>
        <div className={cn(isRTL && "text-right")}>
          <h1 className="text-2xl font-bold">{t("pharmacyStock")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{stock?.length ?? 0} {t("medicationsTracked")}</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStock")}</SelectItem>
            <SelectItem value="low">{t("lowStockOnly")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className={cn("border", (alerts?.totalLowStock ?? 0) > 0 && "border-amber-300 bg-amber-50/30")}>
          <CardContent className={cn("p-4 flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <div className={cn(isRTL && "text-right")}>
              <p className="text-xs text-muted-foreground">{t("lowStockItems")}</p>
              <p className="text-2xl font-bold text-amber-600">{alerts?.totalLowStock ?? 0}</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </CardContent>
        </Card>
        <Card className={cn("border", (alerts?.totalExpiringSoon ?? 0) > 0 && "border-red-300 bg-red-50/30")}>
          <CardContent className={cn("p-4 flex items-center justify-between", isRTL && "flex-row-reverse")}>
            <div className={cn(isRTL && "text-right")}>
              <p className="text-xs text-muted-foreground">{t("expiringSoon")}</p>
              <p className="text-2xl font-bold text-red-600">{alerts?.totalExpiringSoon ?? 0}</p>
            </div>
            <Package className="w-5 h-5 text-red-500" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {isLoading
          ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)
          : stock?.length === 0
          ? (
            <Card className="border-dashed border-border">
              <CardContent className="py-16 text-center">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("noStockItems")}</p>
              </CardContent>
            </Card>
          )
          : stock?.map((item) => {
              const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
              const isExpiringSoon = expiryDate && expiryDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              const stockPct = Math.min((item.quantity / (item.minimumQuantity * 3)) * 100, 100);
              return (
                <Card key={item.id} className={cn("border", item.isLowStock && "border-amber-300 bg-amber-50/30")}>
                  <CardContent className="p-3">
                    <div className={cn("flex items-center justify-between gap-2", isRTL && "flex-row-reverse")}>
                      <div className="flex-1 min-w-0">
                        <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "flex-row-reverse")}>
                          <p className="font-medium text-sm truncate">{item.medicationName ?? `Med #${item.medicationId}`}</p>
                          {item.isLowStock && (
                            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 gap-1 shrink-0">
                              <AlertTriangle className="w-3 h-3" /> {t("low")}
                            </Badge>
                          )}
                          {isExpiringSoon && (
                            <Badge variant="outline" className="text-xs text-red-700 border-red-300 shrink-0">
                              {t("expiringSoon")}
                            </Badge>
                          )}
                        </div>
                        <div className={cn("flex items-center gap-4 mt-1", isRTL && "flex-row-reverse")}>
                          <span className="text-xs text-muted-foreground">
                            {t("qty")}: <strong className={item.isLowStock ? "text-amber-600" : "text-foreground"}>{item.quantity}</strong>
                            <span className="text-muted-foreground"> / min {item.minimumQuantity}</span>
                          </span>
                          {expiryDate && (
                            <span className={cn("text-xs", isExpiringSoon ? "text-red-600" : "text-muted-foreground")}>
                              {t("expiry")}: {expiryDate.toLocaleDateString(isRTL ? "ar-AE" : "en-AE")}
                            </span>
                          )}
                          {item.batchNumber && (
                            <span className="text-xs text-muted-foreground">#{item.batchNumber}</span>
                          )}
                        </div>
                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", item.isLowStock ? "bg-amber-400" : "bg-primary")}
                            style={{ width: `${stockPct}%` }}
                          />
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setEditItem(item)} className="shrink-0">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <EditStockDialog item={editItem} onClose={() => setEditItem(null)} />
    </div>
  );
}
