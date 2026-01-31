
# خطة: إزالة `text-left` من جميع مكونات الحوار (Dialog/AlertDialog/Sheet)

## المشكلة
مكونات AlertDialog و Sheet تستخدم `sm:text-left` في Header مما يجعل النص يُحاذى لليسار على الشاشات الكبيرة، وهذا خاطئ للواجهة العربية RTL.

---

## التحليل

| الملف | المكون | الحالي | المطلوب |
|-------|--------|--------|---------|
| `src/components/ui/alert-dialog.tsx` | `AlertDialogHeader` | `text-center sm:text-left` | `text-right` |
| `src/components/ui/sheet.tsx` | `SheetHeader` | `text-center sm:text-left` | `text-right` |
| `src/components/ui/dialog.tsx` | `DialogHeader` | `text-right` ✓ | لا تغيير (صحيح) |

---

## التعديلات المطلوبة

### 1) تحديث AlertDialogHeader (سطر 47)

**قبل:**
```tsx
const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
```

**بعد:**
```tsx
const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-right", className)} {...props} />
);
```

### 2) تحديث SheetHeader (سطر 71)

**قبل:**
```tsx
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
```

**بعد:**
```tsx
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-right", className)} {...props} />
);
```

---

## الملفات المطلوب تعديلها

| الملف | التعديل |
|-------|---------|
| `src/components/ui/alert-dialog.tsx` | تغيير `AlertDialogHeader` من `text-center sm:text-left` إلى `text-right` |
| `src/components/ui/sheet.tsx` | تغيير `SheetHeader` من `text-center sm:text-left` إلى `text-right` |

---

## النتيجة

جميع حوارات التأكيد (AlertDialog) والأدراج الجانبية (Sheet) ستعرض العناوين والنصوص محاذاة لليمين بشكل صحيح للغة العربية في جميع أحجام الشاشات.
