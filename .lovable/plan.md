
# خطة: إغلاق نافذة نجاح الوثيقة عند النقر خارجها

## المشكلة

عند النقر خارج نافذة "تم إنشاء الوثيقة بنجاح" (على اليمين أو اليسار):
- النافذة تختفي ✓
- لكن معالج إنشاء الوثيقة يبقى مفتوحًا ❌

السبب: `onOpenChange(false)` يخفي فقط نافذة النجاح، بينما `onClose()` يقوم بالإغلاق الكامل.

---

## الحل

### الملف: `src/components/policies/PolicySuccessDialog.tsx`

**تعديل `onOpenChange`** ليستدعي `onClose()` عند الإغلاق:

```typescript
// قبل (السطر 205):
<Dialog open={open} onOpenChange={onOpenChange}>

// بعد:
<Dialog 
  open={open} 
  onOpenChange={(isOpen) => {
    if (!isOpen) {
      // عند الإغلاق (بأي طريقة)، قم بالإغلاق الكامل
      handleClose();
    } else {
      onOpenChange(isOpen);
    }
  }}
>
```

**أو ببساطة:**

```typescript
<Dialog 
  open={open} 
  onOpenChange={(isOpen) => !isOpen && handleClose()}
>
```

هذا يضمن أنه عند النقر:
- على الخلفية (overlay) ← يتم استدعاء `handleClose()`
- على زر X ← يتم استدعاء `handleClose()` (عبر نفس الآلية)
- على زر "إغلاق" ← يتم استدعاء `handleClose()` مباشرة

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicySuccessDialog.tsx` | تعديل `onOpenChange` ليستدعي `handleClose` |

---

## النتيجة المتوقعة

1. ✅ النقر خارج النافذة يغلق كل شيء (نافذة النجاح + معالج الوثيقة)
2. ✅ النقر على زر X يغلق كل شيء
3. ✅ النقر على زر "إغلاق" يغلق كل شيء
4. ✅ بعد الإغلاق، يتم التنقل لصفحة العميل
