
# خطة التحسينات: عرض التاريخ في المهام + إصلاح عرض خطأ مسح الشيكات

## المشاكل المكتشفة

### 1. المهام - عدم ظهور التاريخ
المهام المتأخرة تظهر فقط بالوقت (12:00) لكن بدون تاريخها الأصلي. هذا يسبب ارتباكاً لأن المستخدم لا يعرف من أي يوم هذه المهمة.

### 2. مسح الشيكات - رسالة الخطأ غير واضحة
الخطأ الفعلي هو **402 - نفاد اعتمادات AI** لكن يظهر رسالة عامة "Edge Function returned a non-2xx status code" مع رابط غير مناسب (ScanApp).

---

## التغييرات المطلوبة

### الملف 1: `src/components/tasks/TaskCard.tsx`

**إضافة عرض التاريخ للمهام المتأخرة**

```tsx
// في قسم Time badge - السطر 84-89
<div className={cn(
  "flex flex-col items-center justify-center min-w-[70px] py-3 px-3 rounded-xl shadow-sm",
  ...
)}>
  <Clock className="h-4 w-4 mb-1" />
  <span className="text-base font-bold font-mono ltr-nums">
    {formatTime(task.due_time)}
  </span>
  {/* إضافة: عرض التاريخ للمهام المتأخرة */}
  {task.isOverdue && (
    <span className="text-[10px] mt-0.5 opacity-75">
      {format(new Date(task.due_date), 'd/M', { locale: ar })}
    </span>
  )}
</div>
```

**تحديث Props و interface:**
```tsx
interface TaskCardProps {
  task: Task & { isOverdue?: boolean };
  // ...
}
```

---

### الملف 2: `src/components/payments/ChequeScannerDialog.tsx`

**تحسين معالجة الأخطاء لعرض رسائل واضحة:**

#### التغيير 1: تحسين قراءة خطأ Edge Function (السطر 505-520)
```tsx
const { data, error: fnError } = await supabase.functions.invoke('process-cheque-scan', {
  body: { images: base64Images }
});

// تحسين: التعامل مع أخطاء Edge Function بشكل أفضل
if (fnError) {
  const errorMsg = fnError.message || '';
  console.error('Edge function error:', errorMsg);
  
  // Check if error body contains specific error info
  if (errorMsg.includes('402') || errorMsg.includes('credits') || errorMsg.includes('payment')) {
    throw new Error('نفدت اعتمادات AI. يرجى إضافة رصيد للمتابعة.');
  }
  if (errorMsg.includes('429') || errorMsg.includes('rate')) {
    throw new Error('تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.');
  }
  // Default: Show the actual error or a generic message
  throw new Error('خطأ في الاتصال بخدمة التحليل. حاول مرة أخرى.');
}
```

#### التغيير 2: تحسين عرض رسالة الخطأ (السطر 641-656)

```tsx
{/* Error Message - Context-aware */}
{error && (
  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
    <div className="text-sm">
      <p className="text-destructive font-medium">{error}</p>
      {/* عرض رابط ScanApp فقط إذا كان الخطأ متعلق بالسكانر */}
      {(error.includes('سكانر') || error.includes('ScanApp') || error.includes('مسح')) && (
        <a 
          href="https://asprise.com/document-scan-upload-image-browser/html-web-scanner-download.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline text-xs mt-1 block"
        >
          تحميل ScanApp
        </a>
      )}
    </div>
  </div>
)}
```

---

## ملخص التغييرات

| الملف | التغيير |
|-------|---------|
| `TaskCard.tsx` | إضافة عرض التاريخ (يوم/شهر) أسفل الوقت للمهام المتأخرة |
| `ChequeScannerDialog.tsx` | تحسين رسائل الخطأ + إخفاء رابط ScanApp عند أخطاء AI |

---

## النتيجة المتوقعة

### قبل:
| المهام | مسح الشيكات |
|--------|-------------|
| متأخر 12:00 (بدون تاريخ) | خطأ عام + رابط ScanApp |

### بعد:
| المهام | مسح الشيكات |
|--------|-------------|
| متأخر 12:00 + 5/2 (التاريخ) | "نفدت اعتمادات AI" (بدون رابط ScanApp) |

---

## ملاحظة هامة حول نفاد الاعتمادات

خطأ **402 - Payment Required** يعني أن اعتمادات Lovable AI نفدت.

**الحل**: إضافة رصيد من: Settings → Workspace → Usage → Add Credits

الإصلاحات في الكود ستضمن عرض رسالة واضحة بالعربية للمستخدم بدلاً من الرسالة التقنية.
