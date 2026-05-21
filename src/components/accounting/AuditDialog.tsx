import { useCallback, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const EmptyState = ({ text }: { text: string }) => (
  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
    {text}
  </div>
);

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
  /** Override "ours" total shown in the summary (e.g. remaining after payments) */
  oursTotalOverride?: number;
  oursHintOverride?: string;
}

export function AuditDialog({
  open, onMinimize, onClose, dbRows, filterDescription, comparedFieldLabel,
  result, setResult, onGoToRow, oursTotalOverride, oursHintOverride,
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

  const dbRowsTotal = useMemo(() => dbRows.reduce((s, r) => s + (r.auditAmount || 0), 0), [dbRows]);
  const dbTotal = oursTotalOverride != null ? oursTotalOverride : dbRowsTotal;
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
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between gap-3 px-5 py-3.5 border-b sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">تدقيق الكشف بالذكاء الاصطناعي</DialogTitle>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{filterDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onMinimize} title="تصغير">
              <Minus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { reset(); onClose(); }} title="إغلاق ومسح">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-5">
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
                  "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
                  dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <p className="font-semibold">اسحب الكشف هنا أو اضغط للاختيار</p>
                <p className="text-xs text-muted-foreground mt-1.5">صور (JPG/PNG) أو PDF — يمكن رفع عدة ملفات</p>
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
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
                      {f.type === "application/pdf"
                        ? <FileText className="h-4 w-4 text-destructive" />
                        : <ImageIcon className="h-4 w-4 text-primary" />}
                      <span className="text-sm flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={runAudit} disabled={loading || files.length === 0} className="gap-2 h-10 px-5">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "جاري التحليل... (20-40 ثانية)" : "ابدأ التدقيق"}
                </Button>
              </div>
            </>
          )}

          {result && diff && (
            <>
              {/* AI metadata — clean labeled grid */}
              <Card className="overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border rtl:divide-x-reverse">
                  <MetaCell label="الشركة" value={result.company || "—"} />
                  <MetaCell label="الفترة" value={result.period || "—"} ltr />
                  <MetaCell label="صفوف الكشف" value={String(result.rows.length)} />
                  <MetaCell label="العمود المعتمد" value={result.column_used || "—"} ltr small />
                </div>
                {result.notes && (
                  <Collapsible>
                    <CollapsibleTrigger className="w-full text-xs text-primary inline-flex items-center justify-between gap-1 hover:bg-muted/40 px-4 py-2 border-t">
                      <span className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" /> ملاحظات الذكاء الاصطناعي
                      </span>
                      <ChevronLeft className="h-3 w-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="text-xs text-muted-foreground bg-muted/30 px-4 py-3 whitespace-pre-wrap border-t" dir="auto">
                      {result.notes}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </Card>

              {/* Warning */}
              {hasZeroMatches && (
                <Card className="p-3.5 border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex gap-2.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">لا توجد سيارة مشتركة بين الكشف والجدول</p>
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                        ربما رفعت كشفاً يغطي فترة أو شركة مختلفة عمّا تدقّقه. راجع الفلتر الحالي والكشف المرفوع.
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Summary: Diff first (most important), then both sides */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {result.grand_total != null ? (
                  <SummaryCard
                    label="الفرق"
                    value={fmtSigned(dbTotal - result.grand_total)}
                    hint="عنا − بالكشف"
                    tone={Math.abs(dbTotal - result.grand_total) <= TOLERANCE ? "success" : "warning"}
                  />
                ) : (
                  <SummaryCard
                    label="الفرق"
                    value="—"
                    hint="لا يوجد مجموع كلي بالكشف"
                    tone="muted"
                  />
                )}
                <SummaryCard
                  label="المستحق للشركات عنا"
                  value={fmtCur(dbTotal)}
                  hint={oursHintOverride ?? `${dbRows.length} صف في الجدول`}
                  tone="primary"
                />
                <SummaryCard
                  label="المستحق للشركات بالكشف"
                  value={fmtCur(result.grand_total != null ? result.grand_total : extTotal)}
                  hint={result.grand_total != null ? "إجمالي مطبوع على الكشف" : `مجموع ${result.rows.length} صف مستخرج`}
                  tone="neutral"
                />
              </div>

              {/* Tabbed results */}
              {(() => {
                const tabs = [
                  { key: "mismatch", label: "اختلاف بالمبلغ", icon: AlertTriangle, count: diff.amountMismatch.length, tone: "amber" as const },
                  { key: "missing", label: "ناقص عندنا", icon: MinusCircle, count: diff.missingHere.length, tone: "orange" as const },
                  { key: "extra", label: "زيادة عندنا", icon: PlusCircle, count: diff.extraHere.length, tone: "blue" as const },
                  { key: "matched", label: "مطابق", icon: CheckCircle2, count: diff.matched.length, tone: "emerald" as const },
                ];
                const defaultTab = tabs.find(t => t.count > 0)?.key || "matched";
                const toneRing: Record<string, string> = {
                  amber: "data-[state=active]:bg-amber-50 data-[state=active]:text-amber-800 data-[state=active]:border-amber-300 dark:data-[state=active]:bg-amber-950/30 dark:data-[state=active]:text-amber-300",
                  orange: "data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 data-[state=active]:border-orange-300 dark:data-[state=active]:bg-orange-950/30 dark:data-[state=active]:text-orange-300",
                  blue: "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-800 data-[state=active]:border-blue-300 dark:data-[state=active]:bg-blue-950/30 dark:data-[state=active]:text-blue-300",
                  emerald: "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800 data-[state=active]:border-emerald-300 dark:data-[state=active]:bg-emerald-950/30 dark:data-[state=active]:text-emerald-300",
                };
                const badgeTone: Record<string, string> = {
                  amber: "bg-amber-600 text-white",
                  orange: "bg-orange-600 text-white",
                  blue: "bg-blue-600 text-white",
                  emerald: "bg-emerald-600 text-white",
                };
                return (
                  <Tabs defaultValue={defaultTab} dir="rtl" className="w-full">
                    <TabsList className="w-full h-auto p-1 bg-muted/40 grid grid-cols-2 md:grid-cols-4 gap-1">
                      {tabs.map(t => {
                        const Icon = t.icon;
                        return (
                          <TabsTrigger
                            key={t.key}
                            value={t.key}
                            className={cn(
                              "h-10 gap-2 border border-transparent rounded-md text-xs md:text-sm font-medium transition-all",
                              toneRing[t.tone]
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t.label}</span>
                            <span className={cn(
                              "min-w-[22px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                              t.count === 0 ? "bg-muted text-muted-foreground" : badgeTone[t.tone]
                            )}>{t.count}</span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                    <TabsContent value="mismatch" className="mt-3">
                      {diff.amountMismatch.length === 0 ? <EmptyState text="لا يوجد اختلاف بالمبلغ" /> : (
                        <SimpleList>
                          {diff.amountMismatch.map((m, i) => (
                            <Row key={i}
                              car={m.db.car_number}
                              label={m.db.client_name || m.ext.raw_label}
                              right={
                                <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                                  <span className="text-muted-foreground">عنا</span>
                                  <span>{fmtCur(m.db.auditAmount)}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-muted-foreground">كشف</span>
                                  <span>{fmtCur(m.ext.amount)}</span>
                                  <Badge variant={m.diff > 0 ? "default" : "destructive"} className="ms-1">
                                    {fmtSigned(m.diff)}
                                  </Badge>
                                </div>
                              }
                              onGo={() => onGoToRow(m.db.id)}
                            />
                          ))}
                        </SimpleList>
                      )}
                    </TabsContent>

                    <TabsContent value="missing" className="mt-3">
                      {diff.missingHere.length === 0 ? <EmptyState text="لا شيء ناقص عندنا" /> : (
                        <SimpleList>
                          {diff.missingHere.map((e, i) => (
                            <Row key={i}
                              car={e.car_number}
                              label={e.raw_label || "—"}
                              right={<span className="font-mono tabular-nums">{fmtCur(e.amount)}</span>}
                            />
                          ))}
                        </SimpleList>
                      )}
                    </TabsContent>

                    <TabsContent value="extra" className="mt-3">
                      {diff.extraHere.length === 0 ? <EmptyState text="لا يوجد زيادة عندنا" /> : (
                        <SimpleList>
                          {diff.extraHere.map((db) => (
                            <Row key={db.id}
                              car={db.car_number}
                              label={db.client_name}
                              right={<span className="font-mono tabular-nums">{fmtCur(db.auditAmount)}</span>}
                              onGo={() => onGoToRow(db.id)}
                            />
                          ))}
                        </SimpleList>
                      )}
                    </TabsContent>

                    <TabsContent value="matched" className="mt-3">
                      {diff.matched.length === 0 ? <EmptyState text="لا توجد صفوف مطابقة" /> : (
                        <SimpleList>
                          {diff.matched.map((m, i) => (
                            <Row key={i}
                              car={m.db.car_number}
                              label={m.db.client_name || m.ext.raw_label}
                              right={<span className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtCur(m.db.auditAmount)}</span>}
                              onGo={() => onGoToRow(m.db.id)}
                            />
                          ))}
                        </SimpleList>
                      )}
                    </TabsContent>
                  </Tabs>
                );
              })()}

              <div className="flex justify-between pt-3 border-t">
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

function MetaCell({ label, value, ltr, small }: { label: string; value: string; ltr?: boolean; small?: boolean }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">{label}</p>
      <p
        className={cn("font-semibold mt-1 truncate", small ? "text-xs" : "text-sm")}
        dir={ltr ? "ltr" : "auto"}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryCard({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "neutral" | "success" | "warning" | "muted";
}) {
  const toneCls = {
    primary: "bg-gradient-to-br from-primary/8 to-primary/[0.02] border-primary/25 text-primary",
    neutral: "bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-slate-900/10 border-slate-200 dark:border-slate-700 text-foreground",
    success: "bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-emerald-950/10 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    warning: "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-amber-950/10 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    muted: "border-dashed bg-muted/20 text-muted-foreground",
  }[tone];
  return (
    <Card className={cn("p-4 border", toneCls)}>
      <p className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">{label}</p>
      <p className="text-2xl font-bold mt-2 tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-2.5">{hint}</p>
    </Card>
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
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900",
    orange: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900",
    blue: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900",
  };
  const badgeTone: Record<string, string> = {
    emerald: "bg-emerald-600 text-white border-emerald-600",
    amber: "bg-amber-600 text-white border-amber-600",
    orange: "bg-orange-600 text-white border-orange-600",
    blue: "bg-blue-600 text-white border-blue-600",
  };
  return (
    <Collapsible defaultOpen={defaultOpen ?? count > 0}>
      <CollapsibleTrigger asChild>
        <button className={cn("w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors hover:brightness-[0.97]", tone[color])}>
          <span className="flex items-center gap-2">{icon} {title}</span>
          <Badge variant="outline" className={cn("min-w-[28px] justify-center tabular-nums", count === 0 ? "bg-background text-muted-foreground" : badgeTone[color])}>{count}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5">
        {count === 0 ? <p className="text-xs text-muted-foreground px-4 py-2">لا شيء.</p> : children}
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

