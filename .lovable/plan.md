

# خطة إصلاح عرض الصور وخطأ Edge Function

## المشكلة الأولى: ارتفاع بطاقات الصور
الصور تُعرض بارتفاع منخفض جداً (نسبة 4:3) مما يجعل 3 شيكات في صورة واحدة تبدو كـ 2 فقط.

## المشكلة الثانية: خطأ Edge Function
الـ Edge Function `process-cheque-scan` لم تكن منشورة (404 Not Found).
**تم حلها** - قمت بنشر الـ function الآن.

---

## التغييرات المطلوبة

### ملف: `src/components/payments/ChequeScannerDialog.tsx`

#### 1. زيادة ارتفاع الحاوية (Container)
**السطر 426:**
```tsx
// قبل
<div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-1">

// بعد
<div className="grid grid-cols-3 gap-3 max-h-[350px] overflow-y-auto p-1">
```
- تغيير من `grid-cols-4` إلى `grid-cols-3` (صور أكبر)
- زيادة `max-h` من `200px` إلى `350px`
- زيادة `gap` من `2` إلى `3`

#### 2. تعديل نسبة الصورة
**السطر 430:**
```tsx
// قبل
<div className="relative aspect-[4/3] rounded-lg overflow-hidden border bg-muted group">

// بعد  
<div className="relative aspect-[3/4] rounded-lg overflow-hidden border bg-muted group">
```
- تغيير من `aspect-[4/3]` (عريض) إلى `aspect-[3/4]` (طويل)
- هذا يناسب صور الشيكات التي عادة تكون طولية

#### 3. تغيير عرض الصورة
**السطر 435:**
```tsx
// قبل
<img ... className="w-full h-full object-cover" />

// بعد
<img ... className="w-full h-full object-contain" />
```
- تغيير من `object-cover` (يقص الصورة) إلى `object-contain` (يعرض كامل الصورة)

#### 4. تحديث زر "إضافة المزيد"
**السطر 450:**
```tsx
// قبل
className="aspect-[4/3] rounded-lg ..."

// بعد
className="aspect-[3/4] rounded-lg ..."
```
- نفس التغيير للحفاظ على التناسق

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `src/components/payments/ChequeScannerDialog.tsx` | تعديل - ارتفاع الصور |

---

## النتيجة المتوقعة

### قبل:
```text
┌───┐ ┌───┐ ┌───┐ ┌───┐
│ 🔳 │ │ 🔳 │ │ 🔳 │ │ + │   ← 4 أعمدة، صور قصيرة
└───┘ └───┘ └───┘ └───┘
         max-h: 200px
```

### بعد:
```text
┌─────┐ ┌─────┐ ┌─────┐
│     │ │     │ │     │
│  🔳  │ │  🔳  │ │  +  │   ← 3 أعمدة، صور أطول
│     │ │     │ │     │
└─────┘ └─────┘ └─────┘
         max-h: 350px
```

1. **صور أطول** - كل الشيكات الـ 3 مرئية
2. **عدد أعمدة أقل** - صور أكبر وأوضح
3. **بدون قص** - `object-contain` يعرض الصورة كاملة
4. **Edge Function تعمل** - تم نشرها بنجاح

