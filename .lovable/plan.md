

# إضافة زر المسح الضوئي (Scanner) لرافعات الملفات في إنشاء الوثيقة

## الوضع الحالي
في الخطوة 3 من معالج إنشاء الوثيقة (Step3PolicyDetails.tsx)، يوجد رافعان للملفات:
- **ملفات التأمين**: فواتير وإيصالات ترسل للعميل
- **ملفات النظام**: هوية، رخصة، صور سيارة - ملفات داخلية

حالياً كلاهما يحتوي على زر "رفع ملف" فقط، بينما في تفاصيل الوثيقة (PolicyDetailsDrawer) يوجد زر "مسح" إضافي.

## الحل
إضافة زر "مسح" بجانب زر "رفع ملف" في كلا الرافعين، مع استخدام نفس منطق المسح الموجود في `PolicyFilesSection`.

---

## التغييرات المطلوبة

### الملف: `src/components/policies/wizard/Step3PolicyDetails.tsx`

| التغيير | التفاصيل |
|---------|----------|
| إضافة import للأيقونة | `Printer` من lucide-react |
| إضافة state للمسح | `scanning` لتتبع أي رافع يجري المسح |
| إضافة دالة المسح | `handleDirectScan` تشبه الموجودة في PolicyFilesSection |
| إضافة دالة تحويل | `base64ToBlob` لتحويل الصور الممسوحة |
| تعديل واجهة الرافعين | إضافة زر "مسح" بجانب "رفع ملف" |

---

## التفاصيل التقنية

### 1. إضافة State للمسح
```typescript
const [scanning, setScanning] = useState<'insurance' | 'crm' | null>(null);
```

### 2. دالة تحويل Base64 إلى Blob
```typescript
const base64ToBlob = (base64: string): Blob => {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'image/jpeg' });
};
```

### 3. دالة المسح المباشر
```typescript
const handleDirectScan = async (fileType: 'insurance' | 'crm') => {
  if (!window.scanner) {
    toast.error('مكتبة السكانر غير محملة');
    return;
  }

  setScanning(fileType);
  const savedScanner = localStorage.getItem('preferred_scanner');

  const scanRequest = {
    use_asprise_dialog: false,
    show_scanner_ui: false,
    source_name: savedScanner || 'select',
    scanner_name: savedScanner || 'select',
    prompt_scan_more: false,
    twain_cap_setting: {
      ICAP_PIXELTYPE: 'TWPT_RGB',
      ICAP_XRESOLUTION: '200',
      ICAP_YRESOLUTION: '200',
    },
    output_settings: [{
      type: 'return-base64',
      format: 'jpg',
      jpeg_quality: 85,
    }],
  };

  window.scanner.scan(
    (successful, mesg, response) => {
      // معالجة النتيجة وإضافة الملفات للقائمة
    },
    scanRequest
  );
};
```

### 4. تعديل واجهة رافع ملفات التأمين
```jsx
<div className="flex items-center gap-1.5">
  {/* زر المسح */}
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="gap-1.5"
    onClick={() => handleDirectScan('insurance')}
    disabled={scanning === 'insurance'}
  >
    <Printer className="h-4 w-4" />
    مسح
  </Button>
  
  {/* زر الرفع - كما هو */}
  <div className="relative">
    <input ... />
    <Button type="button" size="sm" variant="outline" className="gap-1.5">
      <Upload className="h-4 w-4" />
      رفع ملف
    </Button>
  </div>
</div>
```

### 5. نفس التعديل لرافع ملفات النظام

---

## ملخص الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/components/policies/wizard/Step3PolicyDetails.tsx` | تعديل |

## النتائج المتوقعة

- ✅ زر "مسح" يظهر بجانب "رفع ملف" في كلا الرافعين
- ✅ الضغط على "مسح" يفتح السكانر مباشرة (بدون نافذة منبثقة)
- ✅ الصور الممسوحة تُضاف تلقائياً للقائمة المناسبة
- ✅ يتم حفظ السكانر المفضل للمرات القادمة
- ✅ نفس السلوك الموجود في تفاصيل الوثيقة

