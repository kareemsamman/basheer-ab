import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  ImageIcon, Plus, Trash2, Download, X, Loader2, FileText, FolderOpen, 
  Save, Hash, CheckCircle2, Send, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface MediaFile {
  id: string;
  original_name: string;
  cdn_url: string;
  mime_type: string;
  size: number;
  created_at: string;
  entity_type: string | null;
}

interface PolicyFilesSectionProps {
  policyId: string;
  policyNumber?: string | null;
  clientId?: string;
  clientPhoneNumber?: string | null;
  clientName?: string;
  onPolicyNumberSaved?: (policyNumber: string) => void;
}

export function PolicyFilesSection({ 
  policyId, 
  policyNumber: initialPolicyNumber, 
  clientId,
  clientPhoneNumber,
  clientName,
  onPolicyNumberSaved 
}: PolicyFilesSectionProps) {
  const { toast } = useToast();
  const [insuranceFiles, setInsuranceFiles] = useState<MediaFile[]>([]);
  const [crmFiles, setCrmFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<MediaFile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingImage, setDeletingImage] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("insurance");
  
  // Policy number state
  const [policyNumber, setPolicyNumber] = useState(initialPolicyNumber || "");
  const [savingPolicyNumber, setSavingPolicyNumber] = useState(false);
  const [policyNumberSaved, setPolicyNumberSaved] = useState(!!initialPolicyNumber);

  // Auto-send popup state
  const [showSendPopup, setShowSendPopup] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const autoSendRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setPolicyNumber(initialPolicyNumber || "");
    setPolicyNumberSaved(!!initialPolicyNumber);
  }, [initialPolicyNumber]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      // Fetch insurance files (policy files from insurance company)
      const { data: insuranceData, error: insuranceError } = await supabase
        .from('media_files')
        .select('*')
        .eq('entity_id', policyId)
        .in('entity_type', ['policy', 'policy_insurance'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (insuranceError) throw insuranceError;
      setInsuranceFiles(insuranceData || []);

      // Fetch CRM files (internal docs)
      const { data: crmData, error: crmError } = await supabase
        .from('media_files')
        .select('*')
        .eq('entity_id', policyId)
        .eq('entity_type', 'policy_crm')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (crmError) throw crmError;
      setCrmFiles(crmData || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [policyId]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, fileType: 'insurance' | 'crm') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(fileType);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entity_type', fileType === 'insurance' ? 'policy_insurance' : 'policy_crm');
        formData.append('entity_id', policyId);

        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-media`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Upload failed');
        }
      }

      toast({ title: "تم الرفع", description: "تم رفع الملفات بنجاح" });
      fetchFiles();

      // Show auto-send popup only for insurance files and if client has phone
      if (fileType === 'insurance' && clientPhoneNumber) {
        setCountdown(5);
        setShowSendPopup(true);
        // Start countdown
        countdownRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownRef.current!);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        // Auto-send after 5 seconds
        autoSendRef.current = setTimeout(() => {
          handleSendToClient();
        }, 5000);
      }
    } catch (error: any) {
      console.error('Error uploading:', error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في رفع الملفات", 
        variant: "destructive" 
      });
    } finally {
      setUploading(null);
      event.target.value = '';
    }
  };

  const handleSendToClient = async () => {
    // Cancel auto-send timer
    if (autoSendRef.current) clearTimeout(autoSendRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    
    setSendingToClient(true);
    try {
      const { error } = await supabase.functions.invoke('send-invoice-sms', {
        body: { policy_id: policyId }
      });
      if (error) throw error;
      toast({ title: "تم الإرسال", description: "تم إرسال الملفات للعميل بنجاح" });
    } catch (err: any) {
      console.error('Error sending to client:', err);
      toast({ title: "خطأ", description: err.message || "فشل في الإرسال", variant: "destructive" });
    } finally {
      setSendingToClient(false);
      setShowSendPopup(false);
    }
  };

  const handleCancelSend = () => {
    if (autoSendRef.current) clearTimeout(autoSendRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowSendPopup(false);
  };

  const handleSavePolicyNumber = async () => {
    if (!policyNumber.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال رقم البوليصة", variant: "destructive" });
      return;
    }

    setSavingPolicyNumber(true);
    try {
      const { error } = await supabase
        .from('policies')
        .update({ policy_number: policyNumber.trim() })
        .eq('id', policyId);

      if (error) throw error;

      toast({ title: "تم الحفظ", description: "تم حفظ رقم البوليصة بنجاح" });
      setPolicyNumberSaved(true);
      onPolicyNumberSaved?.(policyNumber.trim());
    } catch (error: any) {
      console.error('Error saving policy number:', error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في حفظ رقم البوليصة", 
        variant: "destructive" 
      });
    } finally {
      setSavingPolicyNumber(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingImage) return;

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-media`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mediaId: deletingImage.id }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Delete failed');
      }

      toast({ title: "تم الحذف", description: "تم حذف الملف بنجاح" });
      fetchFiles();
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في حذف الملف", 
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeletingImage(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const renderFileGrid = (files: MediaFile[]) => {
    if (files.length === 0) {
      return <p className="text-center text-muted-foreground py-6">لا توجد ملفات</p>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="relative group rounded-lg border overflow-hidden bg-muted/30 aspect-square"
          >
            {isImage(file.mime_type) ? (
              <img
                src={file.cdn_url}
                alt={file.original_name}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setSelectedImage(file)}
              />
            ) : (
              <div 
                className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
                onClick={() => window.open(file.cdn_url, '_blank')}
              >
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground mt-2 px-2 truncate w-full text-center">
                  {file.original_name}
                </p>
              </div>
            )}
            
            {/* Overlay actions */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={() => window.open(file.cdn_url, '_blank')}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="destructive"
                className="h-8 w-8"
                onClick={() => {
                  setDeletingImage(file);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Size badge */}
            <div className="absolute bottom-1 right-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
              {formatSize(file.size)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderUploadButton = (fileType: 'insurance' | 'crm') => (
    <div className="relative">
      <input
        type="file"
        multiple
        accept="image/*,.pdf,video/*"
        onChange={(e) => handleUpload(e, fileType)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={uploading !== null}
      />
      <Button size="sm" variant="outline" disabled={uploading !== null}>
        {uploading === fileType ? (
          <Loader2 className="h-4 w-4 ml-1 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 ml-1" />
        )}
        رفع ملف
      </Button>
    </div>
  );

  return (
    <>
      {/* Policy Number Section - Always visible at top */}
      <Card className="p-4 mb-4 border-2 border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <Hash className="h-4 w-4 text-primary" />
          <Label className="font-semibold text-primary">رقم البوليصة</Label>
          {policyNumberSaved && (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              محفوظ
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="أدخل رقم البوليصة..."
            value={policyNumber}
            onChange={(e) => {
              setPolicyNumber(e.target.value);
              setPolicyNumberSaved(false);
            }}
            className="flex-1"
            dir="ltr"
          />
          <Button 
            onClick={handleSavePolicyNumber}
            disabled={savingPolicyNumber || !policyNumber.trim() || policyNumberSaved}
            size="sm"
          >
            {savingPolicyNumber ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 ml-1" />
                حفظ
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          هذا الرقم يستخدم للبحث السريع عن الوثيقة
        </p>
      </Card>

      {/* Files Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full" dir="rtl">
          <TabsTrigger value="insurance" className="text-xs gap-1">
            <ImageIcon className="h-3 w-3" />
            ملفات التأمين ({insuranceFiles.length})
          </TabsTrigger>
          <TabsTrigger value="crm" className="text-xs gap-1">
            <FolderOpen className="h-3 w-3" />
            ملفات النظام ({crmFiles.length})
          </TabsTrigger>
        </TabsList>

        {/* Insurance Files Tab */}
        <TabsContent value="insurance" className="m-0">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <ImageIcon className="h-4 w-4" />
                <span>ملفات البوليصة</span>
              </div>
              {renderUploadButton('insurance')}
            </div>
            <p className="text-xs text-muted-foreground">
              البوليصة من شركة التأمين - يمكنك رفع صور متعددة أو PDF
            </p>
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
            ) : (
              renderFileGrid(insuranceFiles)
            )}
          </Card>
        </TabsContent>

        {/* CRM Files Tab */}
        <TabsContent value="crm" className="m-0">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary-foreground font-semibold">
                <FolderOpen className="h-4 w-4" />
                <span>ملفات النظام</span>
              </div>
              {renderUploadButton('crm')}
            </div>
            <p className="text-xs text-muted-foreground">هوية، رخصة، صور سيارة - ملفات داخلية للنظام</p>
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
            ) : (
              renderFileGrid(crmFiles)
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Image Preview Dialog */}
      {selectedImage && (
        <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="sm:max-w-3xl p-2" dir="rtl">
            <DialogHeader className="sr-only">
              <DialogTitle>معاينة الصورة</DialogTitle>
            </DialogHeader>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <img
              src={selectedImage.cdn_url}
              alt={selectedImage.original_name}
              className="w-full h-auto rounded-lg"
            />
            <p className="text-center text-sm text-muted-foreground mt-2">
              {selectedImage.original_name}
            </p>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="حذف الملف"
        description={`هل أنت متأكد من حذف "${deletingImage?.original_name}"؟`}
        loading={deleting}
      />

      {/* Auto-Send Popup */}
      <Dialog open={showSendPopup} onOpenChange={(open) => !open && handleCancelSend()}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              إرسال للعميل
            </DialogTitle>
            <DialogDescription>
              هل تريد إرسال ملفات البوليصة والفواتير للعميل {clientName}؟
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span>سيتم الإرسال تلقائياً خلال {countdown} ثوانٍ</span>
            </div>
            <Progress value={(5 - countdown) * 20} className="h-2" />
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:gap-2">
            <Button onClick={handleSendToClient} disabled={sendingToClient}>
              {sendingToClient ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              إرسال الآن
            </Button>
            <Button variant="outline" onClick={handleCancelSend} disabled={sendingToClient}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
