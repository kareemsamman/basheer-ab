

# خطة إضافة رفع ملفات PDF لمسح الشيكات

## الوضع الحالي
نافذة "مسح الشيكات" (`ChequeScannerDialog`) تدعم **فقط** المسح من السكانر الفيزيائي. لا يوجد خيار لرفع ملفات PDF.

## المطلوب
إضافة إمكانية رفع ملفات PDF متعددة بجانب زر المسح، بحيث:
1. يمكن رفع أكثر من ملف PDF
2. كل صفحة من الـ PDF تُحوّل لصورة
3. جميع الصور تُعالج بنفس طريقة الصور الممسوحة من السكانر
4. الميزة متاحة في **كل** الأماكن التي تستخدم `ChequeScannerDialog`

---

## التغييرات المطلوبة

### ملف: `src/components/payments/ChequeScannerDialog.tsx`

#### 1. إضافة imports جديدة:
```typescript
import { Upload, FileText } from 'lucide-react';
```

#### 2. إضافة state لملفات PDF:
```typescript
const [isLoadingPdf, setIsLoadingPdf] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

#### 3. إضافة دالة تحويل PDF إلى صور:
```typescript
const handlePdfUpload = async (files: FileList) => {
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
        const viewport = page.getViewport({ scale: 2.0 }); // 300 DPI equivalent
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        newImages.push(canvas.toDataURL('image/jpeg', 0.95));
      }
    }
    
    setScannedImages(prev => [...prev, ...newImages]);
    toast.success(`تم تحويل ${newImages.length} صفحة من ملفات PDF`);
    
  } catch (err) {
    console.error('PDF processing error:', err);
    setError('خطأ في معالجة ملف PDF');
  } finally {
    setIsLoadingPdf(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
```

#### 4. تحديث واجهة المستخدم - إضافة زر رفع PDF:
```tsx
{/* Stage: Scanning */}
{stage === 'scanning' && (
  <>
    {/* Scan & Upload Buttons */}
    <div className="flex justify-center gap-3">
      {/* Scanner Button */}
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
      
      {/* PDF Upload Button */}
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
    
    {/* Instructions */}
    {scannedImages.length === 0 && !error && (
      <div className="text-center text-sm text-muted-foreground space-y-1">
        <p>امسح الشيكات من السكانر أو ارفع ملفات PDF/صور</p>
        <p className="text-xs">يمكنك رفع عدة ملفات PDF وسيتم تحويل كل صفحة لصورة</p>
      </div>
    )}
  </>
)}
```

#### 5. تعطيل أزرار الحفظ أثناء التحميل:
```tsx
<Button
  onClick={handleClose}
  disabled={isScanning || isProcessing || isLoadingPdf}
>
```

---

## شكل واجهة المستخدم النهائية

```text
┌────────────────────────────────────────────────────────────────┐
│  🔍 مسح الشيكات                                          [X]  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│    ┌─────────────────┐    ┌──────────────────────┐            │
│    │ 🖨️ مسح من السكانر │    │ 📤 رفع PDF / صور   │            │
│    └─────────────────┘    └──────────────────────┘            │
│                                                                │
│    امسح الشيكات من السكانر أو ارفع ملفات PDF/صور             │
│    يمكنك رفع عدة ملفات PDF وسيتم تحويل كل صفحة لصورة         │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  [إلغاء]                                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## سير العمل

1. المستخدم يضغط "رفع PDF / صور"
2. يختار ملف PDF واحد أو أكثر (أو صور)
3. النظام يحوّل كل صفحة PDF إلى صورة JPEG
4. الصور تُضاف لقائمة `scannedImages`
5. المستخدم يضغط "تحليل الشيكات"
6. AI يكتشف الشيكات ويستخرج البيانات (نفس سير العمل الحالي)

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/components/payments/ChequeScannerDialog.tsx` | تعديل - إضافة رفع PDF |

---

## النتيجة المتوقعة

1. **زر رفع PDF** بجانب زر المسح
2. **دعم ملفات متعددة** - يمكن رفع أكثر من PDF
3. **تحويل تلقائي** - كل صفحة تصبح صورة
4. **نفس المعالجة** - AI يحلل الصور بنفس الطريقة
5. **متاح في كل الأماكن** - المكون مشترك

