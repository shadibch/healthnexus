import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Search, Pill, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MedicationOption {
  id: number;
  name: string;
  genericName: string | null;
  category: string | null;
  dosageForm: string | null;
  strength: string | null;
}

interface Props {
  value: MedicationOption | null;
  onSelect: (med: MedicationOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  isRTL?: boolean;
  lang?: string;
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export default function MedicationAutocomplete({
  value,
  onSelect,
  placeholder,
  disabled = false,
  isRTL = false,
  lang = "en",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicationOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMeds = useCallback(
    debounce(async (q: string) => {
      if (!q.trim() || q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiFetch<MedicationOption[]>(`/medications?search=${encodeURIComponent(q)}&limit=12`);
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280),
    []
  );

  useEffect(() => {
    fetchMeds(query);
  }, [query, fetchMeds]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const handleSelect = (med: MedicationOption) => {
    onSelect(med);
    setQuery("");
    setOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  // If a value is selected, show the chip instead of the input
  if (value) {
    return (
      <div className={cn(
        "flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm",
        isRTL && "flex-row-reverse"
      )}>
        <Pill className="w-4 h-4 text-primary shrink-0" />
        <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
          <span className="font-semibold text-foreground">{value.genericName ?? value.name}</span>
          {value.name !== value.genericName && (
            <span className="ml-1.5 text-xs text-muted-foreground">({value.name})</span>
          )}
          {value.strength && (
            <span className="ml-1.5 text-xs text-muted-foreground">· {value.strength}</span>
          )}
          {value.dosageForm && (
            <span className="ml-1 text-xs text-muted-foreground">{value.dosageForm}</span>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className={cn(
          "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none",
          isRTL ? "right-3" : "left-3"
        )} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder ?? (lang === "ar" ? "ابحث باسم الدواء العلمي..." : "Search by generic name...")}
          disabled={disabled}
          dir={isRTL ? "rtl" : "ltr"}
          className={cn(
            "w-full h-9 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed",
            isRTL ? "pr-9 pl-3" : "pl-9 pr-3"
          )}
        />
        {loading && (
          <div className={cn("absolute top-1/2 -translate-y-1/2", isRTL ? "left-2.5" : "right-2.5")}>
            <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className={cn(
          "absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg overflow-hidden",
          "max-h-64 overflow-y-auto"
        )}>
          {results.map((med) => (
            <button
              key={med.id}
              type="button"
              onMouseDown={() => handleSelect(med)}
              className={cn(
                "w-full px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0",
                isRTL && "text-right"
              )}
            >
              <div className={cn("flex items-start gap-2", isRTL && "flex-row-reverse")}>
                <Pill className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {med.genericName ?? med.name}
                  </p>
                  <div className={cn("flex items-center gap-1.5 mt-0.5 flex-wrap", isRTL && "flex-row-reverse")}>
                    {med.name !== med.genericName && (
                      <span className="text-xs text-muted-foreground">{med.name}</span>
                    )}
                    {med.strength && (
                      <span className="text-xs font-medium text-primary/80">{med.strength}</span>
                    )}
                    {med.dosageForm && (
                      <span className="text-xs text-muted-foreground">{med.dosageForm}</span>
                    )}
                    {med.category && (
                      <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                        {med.category}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg px-4 py-3 text-sm text-muted-foreground text-center">
          {lang === "ar" ? "لا توجد أدوية مطابقة" : "No matching medications found"}
        </div>
      )}
    </div>
  );
}
