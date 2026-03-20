import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { WorkerDrawer, type Worker } from '@/components/workers/WorkerDrawer';
import { SalaryDialog, type Salary } from '@/components/workers/SalaryDialog';
import { FileUploader } from '@/components/media/FileUploader';
import {
  Plus, Search, Pencil, Trash2, ArrowRight, DollarSign, Loader2,
  FileImage, FileText as FileTextIcon, Download, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

const MONTHS_AR: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل',
  5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس',
  9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي', cheque: 'شيك', bank_transfer: 'تحويل بنكي', visa: 'فيزا',
};

interface MediaFile {
  id: string;
  original_name: string;
  cdn_url: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export default function Workers() {
  // Workers list state
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [deleteWorker, setDeleteWorker] = useState<Worker | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Worker detail state
  const [viewingWorker, setViewingWorker] = useState<Worker | null>(null);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [salariesLoading, setSalariesLoading] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
  const [deleteSalary, setDeleteSalary] = useState<Salary | null>(null);
  const [deleteSalaryLoading, setDeleteSalaryLoading] = useState(false);

  // Worker files state
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('workers')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,id_number.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setWorkers((data || []) as Worker[]);
    } catch (err: any) {
      toast.error('فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const fetchSalaries = useCallback(async (workerId: string) => {
    setSalariesLoading(true);
    try {
      const { data, error } = await supabase
        .from('worker_salaries')
        .select('*')
        .eq('worker_id', workerId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      setSalaries((data || []) as Salary[]);
    } catch {
      toast.error('فشل تحميل الرواتب');
    } finally {
      setSalariesLoading(false);
    }
  }, []);

  const fetchFiles = useCallback(async (workerId: string) => {
    setFilesLoading(true);
    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('id, original_name, cdn_url, mime_type, size, created_at')
        .eq('entity_type', 'worker')
        .eq('entity_id', workerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFiles((data || []) as MediaFile[]);
    } catch {
      toast.error('فشل تحميل الملفات');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  const openWorkerDetail = (worker: Worker) => {
    setViewingWorker(worker);
    fetchSalaries(worker.id);
    fetchFiles(worker.id);
  };

  const handleDelete = async () => {
    if (!deleteWorker) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteWorker.id);
      if (error) throw error;
      toast.success('تم حذف الموظف');
      setDeleteWorker(null);
      if (viewingWorker?.id === deleteWorker.id) setViewingWorker(null);
      fetchWorkers();
    } catch {
      toast.error('فشل الحذف');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSalary = async () => {
    if (!deleteSalary) return;
    setDeleteSalaryLoading(true);
    try {
      // Delete linked expense first
      if (deleteSalary.expense_id) {
        await supabase.from('expenses').delete().eq('id', deleteSalary.expense_id);
      }
      const { error } = await supabase.from('worker_salaries').delete().eq('id', deleteSalary.id);
      if (error) throw error;
      toast.success('تم حذف الراتب وسند الصرف');
      setDeleteSalary(null);
      if (viewingWorker) fetchSalaries(viewingWorker.id);
    } catch {
      toast.error('فشل الحذف');
    } finally {
      setDeleteSalaryLoading(false);
    }
  };

  const totalSalaries = salaries.reduce((sum, s) => sum + Number(s.amount), 0);

  // Worker detail view
  if (viewingWorker) {
    return (
      <MainLayout>
        <Header title={`${viewingWorker.first_name} ${viewingWorker.last_name}`} subtitle="بيانات الموظف والرواتب" />
        <div className="p-4 md:p-6 space-y-6">
          {/* Back + Actions */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setViewingWorker(null)} className="gap-2">
              <ArrowRight className="h-4 w-4" />
              العودة للقائمة
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingWorker(viewingWorker); setDrawerOpen(true); }}>
                <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteWorker(viewingWorker)}>
                <Trash2 className="h-3.5 w-3.5 ml-1" /> حذف
              </Button>
            </div>
          </div>

          {/* Worker Info Card */}
          <div className="grid gap-4 sm:grid-cols-3 rounded-lg border p-4">
            <div>
              <p className="text-sm text-muted-foreground">الاسم الكامل</p>
              <p className="font-medium">{viewingWorker.first_name} {viewingWorker.last_name}</p>
            </div>
            {viewingWorker.id_number && (
              <div>
                <p className="text-sm text-muted-foreground">رقم الهوية</p>
                <p className="font-mono">{viewingWorker.id_number}</p>
              </div>
            )}
            {(viewingWorker as any).phone && (
              <div>
                <p className="text-sm text-muted-foreground">الهاتف</p>
                <p className="font-mono">{(viewingWorker as any).phone}</p>
              </div>
            )}
          </div>

          {/* Files Section */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">ملفات الموظف</h3>
            <FileUploader
              entityType="worker"
              entityId={viewingWorker.id}
              onUploadComplete={() => fetchFiles(viewingWorker.id)}
            />
            {filesLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            ) : files.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {files.map(f => (
                  <a
                    key={f.id}
                    href={f.cdn_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2.5 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    {f.mime_type.startsWith('image/') ? (
                      <img src={f.cdn_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{f.original_name}</p>
                      <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد ملفات</p>
            )}
          </div>

          {/* Salaries Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">الرواتب</h3>
                <Badge variant="secondary">إجمالي: ₪{totalSalaries.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Badge>
              </div>
              <Button size="sm" onClick={() => { setEditingSalary(null); setSalaryDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5 ml-1" /> إضافة راتب
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الشهر / السنة</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                    <TableHead className="text-right">سند صرف</TableHead>
                    <TableHead className="text-right w-24">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salariesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : salaries.length > 0 ? (
                    salaries.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{MONTHS_AR[s.month]} {s.year}</TableCell>
                        <TableCell className="font-bold">₪{Number(s.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[s.payment_method] || s.payment_method}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{s.notes || '-'}</TableCell>
                        <TableCell>
                          {s.expense_id ? (
                            <Badge variant="default" className="text-xs">سند صرف ✓</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">-</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingSalary(s); setSalaryDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteSalary(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>لا توجد رواتب مسجلة</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Salary Dialog */}
        {viewingWorker && (
          <SalaryDialog
            open={salaryDialogOpen}
            onOpenChange={setSalaryDialogOpen}
            worker={viewingWorker}
            salary={editingSalary}
            onSaved={() => fetchSalaries(viewingWorker.id)}
          />
        )}

        {/* Delete Salary Confirm */}
        <DeleteConfirmDialog
          open={!!deleteSalary}
          onOpenChange={open => !open && setDeleteSalary(null)}
          onConfirm={handleDeleteSalary}
          title="حذف الراتب"
          description={deleteSalary ? `هل أنت متأكد من حذف راتب ${MONTHS_AR[deleteSalary.month]} ${deleteSalary.year}؟ سيتم حذف سند الصرف المرتبط أيضاً.` : ''}
        />

        {/* Worker Drawer (for editing from detail view) */}
        <WorkerDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          worker={editingWorker}
          onSaved={() => {
            setDrawerOpen(false);
            fetchWorkers();
            // Refresh viewing worker data
            if (viewingWorker && editingWorker) {
              const updated = { ...viewingWorker, ...editingWorker };
              // Re-fetch to get latest data
              supabase.from('workers').select('*').eq('id', viewingWorker.id).single().then(({ data }) => {
                if (data) setViewingWorker(data as Worker);
              });
            }
          }}
        />

        <DeleteConfirmDialog
          open={!!deleteWorker}
          onOpenChange={open => !open && setDeleteWorker(null)}
          onConfirm={handleDelete}
          title="حذف الموظف"
          description={deleteWorker ? `هل أنت متأكد من حذف ${deleteWorker.first_name} ${deleteWorker.last_name}؟` : ''}
        />
      </MainLayout>
    );
  }

  // Workers list view
  return (
    <MainLayout>
      <Header
        title="الموظفون"
        subtitle="إدارة بيانات الموظفين والرواتب"
        action={{ label: 'إضافة موظف', onClick: () => { setEditingWorker(null); setDrawerOpen(true); } }}
      />

      <div className="p-4 md:p-6 space-y-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو رقم الهوية..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">رقم الهوية</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">تاريخ الإضافة</TableHead>
                <TableHead className="text-right w-32">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : workers.length > 0 ? (
                workers.map(w => (
                  <TableRow key={w.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openWorkerDetail(w)}>
                    <TableCell className="font-medium">{w.first_name} {w.last_name}</TableCell>
                    <TableCell className="font-mono text-sm">{w.id_number || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{(w as any).phone || '-'}</TableCell>
                    <TableCell className="text-sm">{format(new Date(w.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openWorkerDetail(w)} title="عرض">
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingWorker(w); setDrawerOpen(true); }} title="تعديل">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteWorker(w)} title="حذف">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <p>لا يوجد موظفون</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <WorkerDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        worker={editingWorker}
        onSaved={() => { setDrawerOpen(false); fetchWorkers(); }}
      />

      <DeleteConfirmDialog
        open={!!deleteWorker}
        onOpenChange={open => !open && setDeleteWorker(null)}
        onConfirm={handleDelete}
        title="حذف الموظف"
        description={deleteWorker ? `هل أنت متأكد من حذف ${deleteWorker.first_name} ${deleteWorker.last_name}؟` : ''}
      />
    </MainLayout>
  );
}
