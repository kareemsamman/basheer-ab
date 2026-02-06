
# خطة إصلاح قص صور الشيكات وإضافتها للدفعات

## المشكلة الحالية

1. **الصورة لا تُقص**: الـ AI يكتشف الـ bounding_box لكل شيك، لكن الصورة الكاملة تُرفع بدلاً من قص كل شيك
2. **الصورة لا تُضاف للدفعة**: عند النقر على "إضافة كدفعات"، رقم الشيك والمبلغ يُضافان لكن صورة الشيك لا تظهر في قسم "صور الشيك"

---

## الحل المقترح

### الجزء 1: قص الصور في الواجهة الأمامية (Client-side Cropping)

بما أن Deno لا يدعم Canvas مباشرة، سنقوم بالقص في المتصفح قبل إرسال البيانات:

**ملف: `src/components/payments/ChequeScannerDialog.tsx`**

إضافة دالة قص الصورة باستخدام Canvas:

```typescript
const cropImageOnClient = async (
  base64Image: string,
  boundingBox: { x: number; y: number; width: number; height: number }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Failed to get canvas context');
      
      // Calculate actual pixel values from percentages
      const cropX = (boundingBox.x / 100) * img.naturalWidth;
      const cropY = (boundingBox.y / 100) * img.naturalHeight;
      const cropW = (boundingBox.width / 100) * img.naturalWidth;
      const cropH = (boundingBox.height / 100) * img.naturalHeight;
      
      canvas.width = cropW;
      canvas.height = cropH;
      
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => reject('Failed to load image');
    img.src = base64Image.startsWith('data:') 
      ? base64Image 
      : `data:image/jpeg;base64,${base64Image}`;
  });
};
```

### الجزء 2: تحديث نوع PaymentLine

**ملف: `src/components/policies/wizard/types.ts`**

```typescript
export interface PaymentLine {
  // ... existing fields ...
  cheque_image_url?: string; // CDN URL for cheque image
}
```

### الجزء 3: تحديث إضافة الشيكات

**ملف: `src/components/policies/wizard/Step4Payments.tsx`**

عند استلام الشيكات من الماسح، تحويل الـ URL إلى File للرفع:

```typescript
onConfirm={async (detectedCheques) => {
  const newPayments: PaymentLine[] = [];
  
  for (const cheque of detectedCheques) {
    const payment: PaymentLine = {
      id: crypto.randomUUID(),
      payment_type: 'cheque',
      amount: cheque.amount || 0,
      payment_date: cheque.payment_date || new Date().toISOString().split('T')[0],
      cheque_number: cheque.cheque_number || '',
      refused: false,
    };
    
    // Convert cheque image to File for pendingImages
    if (cheque.cropped_base64) {
      try {
        const blob = base64ToBlob(cheque.cropped_base64);
        const file = new File([blob], `cheque_${cheque.cheque_number}.jpg`, { type: 'image/jpeg' });
        payment.pendingImages = [file];
      } catch (e) {
        console.error('Failed to convert cheque image:', e);
      }
    }
    
    newPayments.push(payment);
  }
  
  setPayments([...payments, ...newPayments]);
}}
```

### الجزء 4: تحديث Edge Function للقص

**ملف: `supabase/functions/process-cheque-scan/index.ts`**

تحديث prompt الـ AI للحصول على bounding_box أدق:

```
BOUNDING BOX - CRITICAL:
For each cheque in the image, provide PRECISE bounding box:
- x: percentage from LEFT edge where cheque starts (0-100)
- y: percentage from TOP edge where cheque starts (0-100)  
- width: percentage of image width the cheque occupies
- height: percentage of image height the cheque occupies

Example for 3 cheques stacked vertically:
- Top cheque: x=5, y=0, width=90, height=30
- Middle cheque: x=5, y=33, width=90, height=30
- Bottom cheque: x=5, y=66, width=90, height=30
```

---

## تدفق العمل بعد الإصلاح

```text
1. المستخدم يمسح صفحة فيها 3 شيكات
                ↓
2. الـ AI يكتشف 3 شيكات مع bounding_box لكل واحد
                ↓
3. [جديد] المتصفح يقص كل شيك حسب الـ bounding_box
                ↓
4. [جديد] الصورة المقصوصة تُرفع لـ Bunny CDN
                ↓
5. عرض الشيكات مع الصور المقصوصة
                ↓
6. النقر على "إضافة كدفعات"
                ↓
7. [جديد] تحويل الصورة إلى File وإضافتها في pendingImages
                ↓
8. الدفعات تُعرض مع صور الشيكات في قسم الدفعات
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `ChequeScannerDialog.tsx` | إضافة دالة قص الصور على Client |
| `process-cheque-scan/index.ts` | تحسين prompt للحصول على bounding_box دقيق + قص الصور قبل الرفع |
| `types.ts` | إضافة `cheque_image_url` لـ PaymentLine |
| `Step4Payments.tsx` | تحويل صورة الشيك لـ File وإضافتها في pendingImages |

---

## ملاحظات تقنية

1. **القص على Client أفضل من Server** لأن:
   - Deno لا يدعم Canvas مباشرة (يحتاج مكتبات خارجية)
   - المتصفح يملك الصورة الأصلية بالفعل
   - أسرع وأقل ضغطاً على الخادم

2. **base64ToBlob** دالة مساعدة لتحويل base64 إلى Blob:
```typescript
function base64ToBlob(base64: string, type = 'image/jpeg'): Blob {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type });
}
```
