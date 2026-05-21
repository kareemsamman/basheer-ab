import { useCallback, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sparkles, Upload, X, Minus, FileText, Image as ImageIcon, Trash2,
  CheckCircle2, AlertTriangle, MinusCircle, PlusCircle, ChevronLeft,
  Loader2, ArrowLeftCircle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmtCur = (n: number) => `₪${Math.round(Math.abs(n)).toLocaleString()}`;
const fmtSigned = (n: number) => `${n < 0 ? "-" : ""}₪${Math.round(Math.abs(n)).toLocaleString()}`;

export interface AuditDbRow {
  id: string;
  car_number: string | null;
  client_name: string;
  company_name: string;
  /** value to audit against (e.g. payed_for_company for issuances, amount for others) */
  auditAmount: number;
}

export interface AuditExtractedRow {
  car_number: string | null;
  amount: number;
  raw_label: string;
}

export interface AuditResult {
  company: string | null;
  period: string | null;
  column_used: string | null;
  grand_total: number | null;
  notes: string;
  rows: AuditExtractedRow[];
}

interface Diff {
  matched: Array<{ db: AuditDbRow; ext: AuditExtractedRow }>;
  amountMismatch: Array<{ db: AuditDbRow; ext: AuditExtractedRow; diff: number }>;
  missingHere: AuditExtractedRow[]; // in statement, not in DB
  extraHere: AuditDbRow[]; // in DB, not in statement
}

const normalizeCar = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const TOLERANCE = 0.5;

export function computeDiff(dbRows: AuditDbRow[], ext: AuditExtractedRow[]): Diff {
  const dbByCar = new Map<string, AuditDbRow>();
  for (const r of dbRows) {
    const k = normalizeCar(r.car_number);
    if (k) dbByCar.set(k, r);
  }
  const usedDb = new Set<string>();
  const matched: Diff["matched"] = [];
  const amountMismatch: Diff["amountMismatch"] = [];
  const missingHere: AuditExtractedRow[] = [];

  for (const e of ext) {
    const k = normalizeCar(e.car_number);
    if (!k) { missingHere.push(e); continue; }
    const db = dbByCar.get(k);
    if (!db) { missingHere.push(e); continue; }
    usedDb.add(k);
    const d = (db.auditAmount || 0) - (e.amount || 0);
    if (Math.abs(d) <= TOLERANCE) matched.push({ db, ext: e });
    else amountMismatch.push({ db, ext: e, diff: d });
  }
  const extraHere = dbRows.filter(r => {
    const k = normalizeCar(r.car_number);
    return !k || !usedDb.has(k);
  });
  return { matched, amountMismatch, missingHere, extraHere };
}

interface Props {
  open: boolean;
  onMinimize: () => void;
  onClose: () => void;
  dbRows: AuditDbRow[];
  filterDescription: string;
  comparedFieldLabel: string;
  result: AuditResult | null;
  setResult: (r: AuditResult | null) => void;
  onGoToRow: (rowId: string) => void;
}

export function AuditDialog({
  open, onMinimize, onClose, dbRows, filterDescription, comparedFieldLabel,
  result, setResult, onGoToRow,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    if (arr.length === 0) { toast.error("الرجاء رفع صور أو ملفات PDF"); return; }
    setFiles(prev => [...prev, ...arr]);
  };

  const runAudit = async () => {
    if (files.length === 0) { toast.error("ارفع كشفاً أولاً"); return; }
    if (dbRows.length === 0) { toast.error("لا توجد صفوف في الجدول للمقارنة"); return; }
    setLoading(true);
    try {
      const payloadFiles = await Promise.all(files.map(async f => {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return { name: f.name, mime: f.type, base64: btoa(bin) };
      }));

      const hint = `الجدول الحالي يحتوي ${dbRows.length} صفاً. ${filterDescription}. العمود المعتمد للمقارنة: ${comparedFieldLabel}.`;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-statement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ files: payloadFiles, hint }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message || "فشل تحليل الكشف");
        return;
      }
      setResult(data);
      toast.success("اكتمل التدقيق");
    } catch (e: any) {
      toast.error(e?.message || "خطأ في التدقيق");
    } finally {
      setLoading(false);
    }
  };

  const diff = useMemo(() => result ? computeDiff(dbRows, result.rows) : null, [result, dbRows]);

  const dbTotal = useMemo(() => dbRows.reduce((s, r) => s + (r.auditAmount || 0), 0), [dbRows]);
  const extTotal = useMemo(
    () => result ? result.rows.reduce((s, r) => s + (r.amount || 0), 0) : 0,
    [result]
  );

  // Period mismatch detection (very lightweight: just notes that periods differ when present)
  const hasZeroMatches = diff && diff.matched.length === 0 && diff.amountMismatch.length === 0 && result && result.rows.length > 0;

  const reset = () => { setFiles([]); setResult(null); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onMinimize(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0"
      >
        {/* Custom header: actions on visual LEFT for RTL */}
        <DialogHeader className="flex flex-row items-center justify-between gap-2 p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">تدقيق الكشف بالذكاء الاصطناعي</DialogTitle>
              <p className="text-xs text-muted-foreground truncate">{filterDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMinimize} title="تصغير">
              <Minus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { reset(); onClose(); }} title="إغلاق ومسح">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {!result && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">اسحب الكشف هنا أو اضغط للاختيار</p>
                <p className="text-xs text-muted-foreground mt-1">صور (JPG/PNG) أو PDF — يمكن رفع عدة ملفات</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                      {f.type === "application/pdf"
                        ? <FileText className="h-4 w-4 text-destructive" />
                        : <ImageIcon className="h-4 w-4 text-primary" />}
                      <span className="text-sm flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={runAudit} disabled={loading || files.length === 0} className="gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "جاري التحليل... (20-40 ثانية)" : "ابدأ التدقيق"}
                </Button>
              </div>
            </>
          )}

          {result && diff && (
            <>
              {/* AI metadata strip */}
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {result.company && <span><span className="text-muted-foreground">الشركة:</span> <strong>{result.company}</strong></span>}
                  {result.period && <span><span className="text-muted-foreground">الفترة:</span> <strong>{result.period}</strong></span>}
                  {result.column_used && <span><span className="text-muted-foreground">العمود:</span> <strong>{result.column_used}</strong></span>}
                  <span className="text-muted-foreground">عدد الصفوف المستخرجة: <strong className="text-foreground">{result.rows.length}</strong></span>
                </div>
                {result.notes && (
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                      <ChevronLeft className="h-3 w-3" /> ملاحظات الذكاء الاصطناعي
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 text-xs text-muted-foreground bg-muted/40 rounded p-2 whitespace-pre-wrap">
                      {result.notes}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Card>

              {/* Warnings */}
              {hasZeroMatches && (
                <Card className="p-3 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">لا توجد سيارة مشتركة بين الكشف والجدول</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                        ربما رفعت كشفاً يغطي فترة أو شركة مختلفة عمّا تدقّقه. راجع الفلتر الحالي والكشف المرفوع.
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Summary cards: ours / theirs / diff */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">المستحق للشركات عنا</p>
                  <p className="text-2xl font-bold mt-2 text-primary tabular-nums">{fmtCur(dbTotal)}</p>
                  <p className="text-xs text-muted-foreground mt-2">{dbRows.length} صف في الجدول</p>
                </Card>
                <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/40 dark:to-slate-800/40 border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-muted-foreground tracking-wide">المستحق للشركات بالكشف</p>
                  <p className="text-2xl font-bold mt-2 tabular-nums">
                    {result.grand_total != null ? fmtCur(result.grand_total) : fmtCur(extTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {result.grand_total != null ? "إجمالي مطبوع على الكشف" : `مجموع ${result.rows.length} صف مستخرج`}
                  </p>
                </Card>
                {result.grand_total != null ? (
                  <Card className={cn(
                    "p-4 border",
                    Math.abs(dbTotal - result.grand_total) <= TOLERANCE
                      ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 dark:from-emerald-950/30 dark:to-emerald-900/20 dark:border-emerald-800"
                      : "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 dark:from-amber-950/30 dark:to-amber-900/20 dark:border-amber-800"
                  )}>
                    <p className="text-xs font-medium text-muted-foreground tracking-wide">الفرق</p>
                    <p className={cn(
                      "text-2xl font-bold mt-2 tabular-nums",
                      Math.abs(dbTotal - result.grand_total) <= TOLERANCE ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                    )}>{fmtSigned(dbTotal - result.grand_total)}</p>
                    <p className="text-xs text-muted-foreground mt-2">عنا − بالكشف</p>
                  </Card>
                ) : (
                  <Card className="p-4 border-dashed">
                    <p className="text-xs text-muted-foreground">الفرق</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      <Info className="h-3 w-3 inline ml-1" />
                      لم يتم العثور على مجموع كلي في الكشف
                    </p>
                  </Card>
                )}
              </div>

              {/* Sections */}
              <Section
                title="مطابق"
                color="emerald"
                icon={<CheckCircle2 className="h-4 w-4" />}
                count={diff.matched.length}
              >
                {diff.matched.length > 0 && (
                  <SimpleList>
                    {diff.matched.map((m, i) => (
                      <Row key={i}
                        car={m.db.car_number}
                        label={m.db.client_name || m.ext.raw_label}
                        right={<span className="font-mono text-emerald-700">{fmtCur(m.db.auditAmount)}</span>}
                        onGo={() => onGoToRow(m.db.id)}
                      />
                    ))}
                  </SimpleList>
                )}
              </Section>

              <Section
                title="اختلاف بالمبلغ"
                color="amber"
                icon={<AlertTriangle className="h-4 w-4" />}
                count={diff.amountMismatch.length}
                defaultOpen
              >
                {diff.amountMismatch.length > 0 && (
                  <SimpleList>
                    {diff.amountMismatch.map((m, i) => (
                      <Row key={i}
                        car={m.db.car_number}
                        label={m.db.client_name || m.ext.raw_label}
                        right={
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="text-muted-foreground">جدول</span>
                            <span className="text-foreground">{fmtCur(m.db.auditAmount)}</span>
                            <span className="text-muted-foreground">←</span>
                            <span className="text-muted-foreground">كشف</span>
                            <span className="text-foreground">{fmtCur(m.ext.amount)}</span>
                            <Badge variant={m.diff > 0 ? "default" : "destructive"} className="ml-1">
                              {fmtSigned(m.diff)}
                            </Badge>
                          </div>
                        }
                        onGo={() => onGoToRow(m.db.id)}
                      />
                    ))}
                  </SimpleList>
                )}
              </Section>

              <Section
                title="ناقص عندنا (موجود بالكشف فقط)"
                color="orange"
                icon={<MinusCircle className="h-4 w-4" />}
                count={diff.missingHere.length}
                defaultOpen
              >
                {diff.missingHere.length > 0 && (
                  <SimpleList>
                    {diff.missingHere.map((e, i) => (
                      <Row key={i}
                        car={e.car_number}
                        label={e.raw_label || "—"}
                        right={<span className="font-mono">{fmtCur(e.amount)}</span>}
                      />
                    ))}
                  </SimpleList>
                )}
              </Section>

              <Section
                title="زيادة عندنا (موجود بالجدول فقط)"
                color="blue"
                icon={<PlusCircle className="h-4 w-4" />}
                count={diff.extraHere.length}
                defaultOpen
              >
                {diff.extraHere.length > 0 && (
                  <SimpleList>
                    {diff.extraHere.map((db) => (
                      <Row key={db.id}
                        car={db.car_number}
                        label={db.client_name}
                        right={<span className="font-mono">{fmtCur(db.auditAmount)}</span>}
                        onGo={() => onGoToRow(db.id)}
                      />
                    ))}
                  </SimpleList>
                )}
              </Section>

              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={reset} className="gap-2">
                  <Upload className="h-4 w-4" /> تدقيق جديد
                </Button>
                <Button onClick={onMinimize} variant="default" className="gap-2">
                  <Minus className="h-4 w-4" /> تصغير
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title, color, icon, count, defaultOpen, children,
}: {
  title: string;
  color: "emerald" | "amber" | "orange" | "blue";
  icon: React.ReactNode;
  count: number;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const tone: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300",
    amber: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300",
    orange: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300",
    blue: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300",
  };
  return (
    <Collapsible defaultOpen={defaultOpen ?? count > 0}>
      <CollapsibleTrigger asChild>
        <button className={cn("w-full flex items-center justify-between p-3 rounded-lg border text-sm font-medium", tone[color])}>
          <span className="flex items-center gap-2">{icon} {title}</span>
          <Badge variant="outline" className="bg-background">{count}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        {count === 0 ? <p className="text-xs text-muted-foreground p-3">لا شيء.</p> : children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SimpleList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y border rounded-lg overflow-hidden">{children}</div>;
}

function Row({ car, label, right, onGo }: { car: string | null; label: string; right: React.ReactNode; onGo?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-card hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{label}</p>
        <p className="text-xs text-muted-foreground font-mono">{car || "بدون رقم سيارة"}</p>
      </div>
      <div className="shrink-0">{right}</div>
      {onGo && (
        <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={onGo}>
          <ArrowLeftCircle className="h-4 w-4" /> اذهب للصف
        </Button>
      )}
    </div>
  );
}
