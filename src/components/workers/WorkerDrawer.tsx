import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Upload, X, FileImage, FileVideo, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  id_number: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface WorkerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: Worker | null;
  onSaved: () => void;
}

interface PendingFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'webm'];

function getFileIcon(file: File) {
  if (file.type.startsWith('image/')) return FileImage;
  if (file.type.startsWith('video/')) return FileVideo;
  return FileText;
}

export function WorkerDrawer({ open, onOpenChange, worker, onSaved }: WorkerDrawerProps) {
  const isEditing = !!worker;
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setFirstName(worker?.first_name || '');
      setLastName(worker?.last_name || '');
      setIdNumber(worker?.id_number || '');
      setPhone(worker?.phone || '');
      setNotes(worker?.notes || '');
      setPendingFiles([]);
    }
  }, [open, worker]);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) return 'نوع الملف غير مدعوم';
    if (file.size > 50 * 1024 * 1024) return 'حجم الملف يتجاوز 50MB';
    return null;
  };

  const addFiles = (fileList: FileList | File[]) => {
    const newFiles: PendingFile[] = Array.from(fileList).map(file => ({
      id: crypto.randomUUID(),
      file,
      status: validateFile(file) ? 'error' : 'pending',
      progress: 0,
      error: validateFile(file) || undefined,
    }));
    setPendingFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFilesForWorker = async (workerId: string) => {
    const toUpload = pendingFiles.filter(f => f.status === 'pending');
    if (toUpload.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    for (const pf of toUpload) {
      setPendingFiles(prev => prev.map(f =>
        f.id === pf.id ? { ...f, status: 'uploading', progress: 30 } : f
      ));
      try {
        const formData = new FormData();
        formData.append('file', pf.file);
        formData.append('entity_type', 'worker');
        formData.append('entity_id', workerId);
        const response = await supabase.functions.invoke('upload-media', { body: formData });
        if (response.error) throw new Error(response.error.message || 'فشل الرفع');
        setPendingFiles(prev => prev.map(f =>
          f.id === pf.id ? { ...f, status: 'success', progress: 100 } : f
        ));
      } catch (err: any) {
        setPendingFiles(prev => prev.map(f =>
          f.id === pf.id ? { ...f, status: 'error', error: err.message, progress: 0 } : f
        ));
      }
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('الاسم الأول واسم العائلة مطلوبان');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        id_number: idNumber.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      };

      let savedId = worker?.id;

      if (isEditing) {
        const { error } = await supabase.from('workers').update(payload).eq('id', worker.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('workers')
          .insert({ ...payload, created_by: user?.id })
          .select('id')
          .single();
        if (error) throw error;
        savedId = data.id;
      }

      if (savedId && pendingFiles.some(f => f.status === 'pending')) {
        await uploadFilesForWorker(savedId);
      }

      toast.success(isEditing ? 'تم تحديث بيانات الموظف' : 'تمت إضافة الموظف بنجاح');
      onSaved();
    } catch (err: any) {
      toast.error('فشل الحفظ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الاسم الأول *</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="الاسم الأول" />
            </div>
            <div className="space-y-2">
              <Label>اسم العائلة *</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="اسم العائلة" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>رقم الهوية</Label>
              <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="رقم الهوية" className="ltr-input" />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الهاتف" className="ltr-input" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..." rows={3} />
          </div>

          {/* File Upload */}
          <div className="border-t pt-4">
            <Label className="mb-2 block">مرفقات</Label>
            <div
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all hover:border-primary/60 hover:bg-accent/30"
            >
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">اسحب الملفات هنا أو انقر للاختيار</p>
              <p className="text-xs text-muted-foreground">صور، PDF، Word، فيديو • حد أقصى 50MB</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.doc,.docx,video/*"
                className="hidden"
                onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
              />
            </div>
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 mt-2 max-h-[200px] overflow-y-auto">
                {pendingFiles.map(pf => {
                  const Icon = getFileIcon(pf.file);
                  return (
                    <div key={pf.id} className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border text-sm',
                      pf.status === 'success' && 'bg-green-500/5 border-green-500/30',
                      pf.status === 'error' && 'bg-destructive/5 border-destructive/30',
                      pf.status === 'uploading' && 'bg-primary/5 border-primary/30',
                      pf.status === 'pending' && 'bg-card border-border'
                    )}>
                      <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center bg-muted">
                        {pf.status === 'success' ? <CheckCircle className="h-4 w-4 text-green-600" /> :
                         pf.status === 'error' ? <AlertCircle className="h-4 w-4 text-destructive" /> :
                         pf.status === 'uploading' ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> :
                         pf.file.type.startsWith('image/') ? <img src={URL.createObjectURL(pf.file)} alt="" className="w-full h-full object-cover rounded" /> :
                         <Icon className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium">{pf.file.name}</p>
                        {pf.status === 'uploading' && <Progress value={pf.progress} className="h-1 mt-1" />}
                        {pf.error && <p className="text-xs text-destructive">{pf.error}</p>}
                        {pf.status === 'success' && <p className="text-xs text-green-600">تم الرفع</p>}
                      </div>
                      {pf.status !== 'uploading' && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={e => { e.stopPropagation(); removeFile(pf.id); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
