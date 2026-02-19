
# إصلاح: إظهار شريط التمرير الأفقي دائماً في جدول التسوية

## المشكلة
الجدول يدعم التمرير الأفقي (`overflow-x-auto`) لكن شريط التمرير مخفي افتراضياً، والمستخدم لا يعرف أن هناك أعمدة إضافية يمكن الوصول إليها بالتمرير.

## الحل
1. **إظهار شريط التمرير دائماً** باستخدام `overflow-x-scroll` بدل `overflow-x-auto` مع CSS مخصص يجعل الشريط مرئياً بشكل دائم.
2. **إضافة تلميح بصري** (سهم أو تدرج لوني) على حافة الجدول يشير إلى وجود محتوى إضافي.

## التفاصيل التقنية

### ملف: `src/pages/CompanySettlementDetail.tsx`

تغيير wrapper الجدول من:
```
<div className="rounded-lg border overflow-x-auto">
```
إلى:
```
<div className="rounded-lg border overflow-x-scroll scrollbar-always-visible">
```

### ملف: `src/index.css`

إضافة CSS class يجبر الشريط على الظهور دائماً:
```css
.scrollbar-always-visible::-webkit-scrollbar {
  height: 10px;
}
.scrollbar-always-visible::-webkit-scrollbar-track {
  background: hsl(210 20% 96%);
  border-radius: 5px;
}
.scrollbar-always-visible::-webkit-scrollbar-thumb {
  background: hsl(174 72% 40%);
  border-radius: 5px;
}
.scrollbar-always-visible {
  scrollbar-width: thin;
  scrollbar-color: hsl(174, 72%, 40%) hsl(210, 20%, 96%);
}
```

هذا يجعل شريط التمرير مرئياً دائماً بلون يتناسب مع التصميم (teal)، فيعرف المستخدم فوراً أن هناك أعمدة إضافية.

### لا تغييرات في قاعدة البيانات
