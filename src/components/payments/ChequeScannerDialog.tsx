import React, { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  Printer, 
  Loader2, 
  X, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Edit2,
  Check,
  Scan,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
import '@/types/scanner.d.ts';

interface DetectedCheque {
  cheque_number: string;
  payment_date: string;
  amount: number;
  bank_name: string;
  account_number: string;
  branch_number: string;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  image_url?: string;
  cropped_base64?: string;
  // UI state
  isEditing?: boolean;
  isConfirmed?: boolean;
}

interface ChequeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (cheques: DetectedCheque[]) => void;
  title?: string;
}

type Stage = 'scanning' | 'processing' | 'results';

export function ChequeScannerDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'مسح الشيكات',
}: ChequeScannerDialogProps) {
  const [stage, setStage] = useState<Stage>('scanning');
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const [detectedCheques, setDetectedCheques] = useState<DetectedCheque[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkScannerReady = useCallback((): boolean => {
    if (!window.scanner) {
      setError('مكتبة السكانر غير محملة. يرجى تحديث الصفحة.');
      return false;
    }
    return true;
  }, []);

  const handleScan = useCallback(() => {
    if (!checkScannerReady()) return;

    setIsScanning(true);
    setError(null);

    const scanRequest = {
      use_asprise_dialog: true,
      show_scanner_ui: false,
      twain_cap_setting: {
        ICAP_PIXELTYPE: 'TWPT_RGB',
        ICAP_XRESOLUTION: '300',
        ICAP_YRESOLUTION: '300',
      },
      output_settings: [
        {
          type: 'return-base64',
          format: 'jpg',
          jpeg_quality: 95,
        },
      ],
    };

    try {
      window.scanner.scan(
        (successful: boolean, mesg: string, response: string) => {
          setIsScanning(false);

          if (!successful) {
            if (mesg && mesg.includes('cancel')) return;
            setError(mesg || 'فشل في المسح. تأكد من تثبيت ScanApp وتوصيل السكانر.');
            return;
          }

          try {
            const images = window.scanner.getScannedImages(response, true, false);
            
            if (!images || images.length === 0) {
              setError('لم يتم العثور على صور ممسوحة.');
              return;
            }

            const newImages: string[] = images.map((img) => {
              let base64Data = img.src;
              if (!base64Data.startsWith('data:')) {
                base64Data = `data:image/jpeg;base64,${img.src}`;
              }
              return base64Data;
            });

            setScannedImages(prev => [...prev, ...newImages]);
            toast.success(`تم مسح ${newImages.length} صورة`);
          } catch (parseError) {
            console.error('Error parsing scanned images:', parseError);
            setError('خطأ في معالجة الصور الممسوحة.');
          }
        },
        scanRequest
      );
    } catch (err) {
      setIsScanning(false);
      console.error('Scanner error:', err);
      setError('خطأ في الاتصال بالسكانر. تأكد من تثبيت ScanApp.');
    }
  }, [checkScannerReady]);

  // PDF/Image upload handler
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePdfUpload = useCallback(async (files: FileList) => {
    if (files.length === 0) return;
    
    setIsLoadingPdf(true);
    setError(null);
    
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 
        `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      
      const newImages: string[] = [];
      
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          // Handle image files directly
          const base64 = await fileToBase64(file);
          newImages.push(base64);
          continue;
        }
        
        // Convert PDF to images
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // ~300 DPI
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ 
            canvasContext: ctx, 
            viewport,
            canvas 
          }).promise;
          newImages.push(canvas.toDataURL('image/jpeg', 0.95));
        }
      }
      
      setScannedImages(prev => [...prev, ...newImages]);
      toast.success(`تم تحميل ${newImages.length} صورة`);
      
    } catch (err) {
      console.error('PDF processing error:', err);
      setError('خطأ في معالجة ملف PDF');
    } finally {
      setIsLoadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const processImages = useCallback(async () => {
    if (scannedImages.length === 0) {
      toast.error('لا توجد صور للمعالجة');
      return;
    }

    setIsProcessing(true);
    setStage('processing');
    setError(null);

    try {
      // Remove data URL prefix for each image
      const base64Images = scannedImages.map(img => {
        if (img.startsWith('data:')) {
          return img.split(',')[1];
        }
        return img;
      });

      const { data, error: fnError } = await supabase.functions.invoke('process-cheque-scan', {
        body: { images: base64Images }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'فشل في معالجة الصور');
      }

      const cheques: DetectedCheque[] = (data.cheques || []).map((c: DetectedCheque) => ({
        ...c,
        isEditing: false,
        isConfirmed: false,
      }));

      setDetectedCheques(cheques);
      setStage('results');

      if (cheques.length === 0) {
        toast.warning('لم يتم اكتشاف أي شيكات في الصور');
      } else {
        toast.success(`تم اكتشاف ${cheques.length} شيك`);
      }
    } catch (err) {
      console.error('Error processing cheques:', err);
      setError(err instanceof Error ? err.message : 'خطأ في معالجة الشيكات');
      setStage('scanning');
    } finally {
      setIsProcessing(false);
    }
  }, [scannedImages]);

  const updateCheque = (index: number, field: keyof DetectedCheque, value: any) => {
    setDetectedCheques(prev => prev.map((c, i) => 
      i === index ? { ...c, [field]: value } : c
    ));
  };

  const toggleEdit = (index: number) => {
    setDetectedCheques(prev => prev.map((c, i) => 
      i === index ? { ...c, isEditing: !c.isEditing } : c
    ));
  };

  const confirmCheque = (index: number) => {
    setDetectedCheques(prev => prev.map((c, i) => 
      i === index ? { ...c, isConfirmed: true, isEditing: false } : c
    ));
  };

  const removeCheque = (index: number) => {
    setDetectedCheques(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirmAll = () => {
    if (detectedCheques.length === 0) return;
    onConfirm(detectedCheques);
    handleClose();
  };

  const handleClose = () => {
    setStage('scanning');
    setScannedImages([]);
    setDetectedCheques([]);
    setError(null);
    setIsScanning(false);
    setIsProcessing(false);
    onOpenChange(false);
  };

  const totalAmount = detectedCheques.reduce((sum, c) => sum + (c.amount || 0), 0);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-destructive font-medium">{error}</p>
                <a 
                  href="https://asprise.com/document-scan-upload-image-browser/html-web-scanner-download.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline text-xs mt-1 block"
                >
                  تحميل ScanApp
                </a>
              </div>
            </div>
          )}

          {/* Stage: Scanning */}
          {stage === 'scanning' && (
            <>
              {/* Scan & Upload Buttons */}
              <div className="flex justify-center gap-3 flex-wrap">
                <Button
                  onClick={handleScan}
                  disabled={isScanning || isLoadingPdf}
                  size="lg"
                  className="gap-2"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري المسح...
                    </>
                  ) : (
                    <>
                      <Printer className="h-5 w-5" />
                      مسح من السكانر
                    </>
                  )}
                </Button>

                {/* PDF/Image Upload Button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={isScanning || isLoadingPdf}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isLoadingPdf ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري التحميل...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      رفع PDF / صور
                    </>
                  )}
                </Button>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handlePdfUpload(e.target.files)}
                />
              </div>

              {/* Scanned Images Preview */}
              {scannedImages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      الصور الممسوحة ({scannedImages.length})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setScannedImages([])}
                      className="text-destructive hover:text-destructive"
                    >
                      <RefreshCw className="h-4 w-4 ml-1" />
                      مسح الكل
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 max-h-[350px] overflow-y-auto p-1">
                    {scannedImages.map((img, index) => (
                      <div
                        key={index}
                        className="relative aspect-[3/4] rounded-lg overflow-hidden border bg-muted group"
                      >
                        <img
                          src={img}
                          alt={`Scanned page ${index + 1}`}
                          className="w-full h-full object-contain"
                        />
                        <button
                          onClick={() => setScannedImages(prev => prev.filter((_, i) => i !== index))}
                          className="absolute top-1 left-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    
                    {/* Add More Button */}
                    <button
                      onClick={handleScan}
                      disabled={isScanning}
                      className="aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Process Button */}
                  <Button
                    onClick={processImages}
                    className="w-full gap-2"
                    size="lg"
                  >
                    <Scan className="h-5 w-5" />
                    تحليل الشيكات ({scannedImages.length} صورة)
                  </Button>
                </div>
              )}

              {/* Instructions */}
              {scannedImages.length === 0 && !error && (
                <div className="text-center text-sm text-muted-foreground space-y-1">
                  <p>امسح الشيكات من السكانر أو ارفع ملفات PDF/صور</p>
                  <p className="text-xs">يمكنك رفع عدة ملفات PDF وسيتم تحويل كل صفحة لصورة</p>
                </div>
              )}
            </>
          )}

          {/* Stage: Processing */}
          {stage === 'processing' && (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
              <p className="text-lg font-medium">جاري تحليل الشيكات...</p>
              <p className="text-sm text-muted-foreground mt-2">
                يتم استخدام الذكاء الاصطناعي للكشف عن الشيكات واستخراج البيانات
              </p>
            </div>
          )}

          {/* Stage: Results */}
          {stage === 'results' && (
            <>
              {detectedCheques.length === 0 ? (
                <div className="py-8 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">لم يتم اكتشاف شيكات</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    تأكد من جودة الصورة ووضوح الشيكات
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setStage('scanning')}
                    className="mt-4"
                  >
                    إعادة المسح
                  </Button>
                </div>
              ) : (
                <>
                  {/* Success Header */}
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-4">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">تم اكتشاف {detectedCheques.length} شيك</span>
                  </div>

                  {/* Cheques List */}
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {detectedCheques.map((cheque, index) => (
                      <Card 
                        key={index} 
                        className={`p-3 ${cheque.isConfirmed ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : ''}`}
                      >
                        <div className="flex gap-3">
                          {/* Cheque Image Thumbnail */}
                          {(cheque.image_url || cheque.cropped_base64) && (
                            <div className="w-20 h-14 rounded overflow-hidden bg-muted shrink-0">
                              <img
                                src={cheque.image_url || `data:image/jpeg;base64,${cheque.cropped_base64}`}
                                alt={`شيك ${cheque.cheque_number}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to base64 if CDN fails
                                  const target = e.currentTarget;
                                  const fallbackSrc = `data:image/jpeg;base64,${cheque.cropped_base64}`;
                                  if (cheque.cropped_base64 && target.src !== fallbackSrc) {
                                    target.src = fallbackSrc;
                                  }
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Cheque Details */}
                          <div className="flex-1 min-w-0">
                            {cheque.isEditing ? (
                              // Edit Mode
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">رقم الشيك</Label>
                                  <Input
                                    value={cheque.cheque_number}
                                    onChange={(e) => updateCheque(index, 'cheque_number', e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">المبلغ (₪)</Label>
                                  <Input
                                    type="number"
                                    value={cheque.amount}
                                    onChange={(e) => updateCheque(index, 'amount', parseFloat(e.target.value) || 0)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">تاريخ الاستحقاق</Label>
                                  <ArabicDatePicker
                                    value={cheque.payment_date}
                                    onChange={(date) => updateCheque(index, 'payment_date', date)}
                                    className="h-8"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">البنك</Label>
                                  <Input
                                    value={cheque.bank_name}
                                    onChange={(e) => updateCheque(index, 'bank_name', e.target.value)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="col-span-2 flex justify-end gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleEdit(index)}
                                  >
                                    إلغاء
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => confirmCheque(index)}
                                  >
                                    <Check className="h-4 w-4 ml-1" />
                                    تأكيد
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              // View Mode
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-medium text-sm">
                                      #{cheque.cheque_number}
                                    </span>
                                    {cheque.bank_name && (
                                      <span className="text-xs text-muted-foreground">
                                        ({cheque.bank_name})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-muted-foreground">
                                      تاريخ: <span className="ltr-nums">{formatDate(cheque.payment_date)}</span>
                                    </span>
                                    <span className="font-semibold text-primary">
                                      ₪{cheque.amount.toLocaleString()}
                                    </span>
                                  </div>
                                  {cheque.confidence < 80 && (
                                    <span className="text-xs text-amber-600">
                                      ⚠️ دقة منخفضة - يرجى التحقق
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  {cheque.isConfirmed ? (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                      <CheckCircle2 className="h-4 w-4" />
                                      تم التأكيد
                                    </span>
                                  ) : (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                        onClick={() => toggleEdit(index)}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => removeCheque(index)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="font-medium">المجموع:</span>
                    <span className="text-lg font-bold text-primary">
                      ₪{totalAmount.toLocaleString()}
                    </span>
                  </div>

                  {/* Back to Scan */}
                  <Button
                    variant="outline"
                    onClick={() => setStage('scanning')}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 ml-2" />
                    مسح صفحات إضافية
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isScanning || isProcessing || isLoadingPdf}
          >
            إلغاء
          </Button>
          {stage === 'results' && detectedCheques.length > 0 && (
            <Button
              onClick={handleConfirmAll}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              إضافة كدفعات ({detectedCheques.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
