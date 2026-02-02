

# خطة: فتح الأكورديون تلقائياً في تقرير العميل الشامل

## المشكلة
في مودال "تقرير العميل الشامل"، الأكورديونات الخاصة بالسيارات والوثائق مغلقة افتراضياً. المستخدم يريدها مفتوحة.

## التحليل
- الملف: `src/components/clients/ClientReportModal.tsx`
- السطر 313: `const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());`
- يبدأ `expandedCars` كمجموعة فارغة → كل الأكورديونات مغلقة

## الحل

### تغيير واحد بسيط

تهيئة `expandedCars` بكل معرفات السيارات عند فتح المودال:

```typescript
// قبل
const [expandedCars, setExpandedCars] = useState<Set<string>>(new Set());

// بعد - إضافة useEffect لفتح الكل عند فتح المودال
useEffect(() => {
  if (open && cars.length > 0) {
    setExpandedCars(new Set(cars.map(c => c.id)));
  }
}, [open, cars]);
```

## الملف المطلوب تعديله

| الملف | التغيير |
|-------|---------|
| `src/components/clients/ClientReportModal.tsx` | إضافة `useEffect` لفتح كل الأكورديونات عند عرض المودال |

## النتيجة المتوقعة

عند فتح "تقرير العميل الشامل":
- جميع السيارات والوثائق ستظهر مفتوحة مباشرة ✓
- يمكن للمستخدم إغلاق/فتح أي أكورديون كالمعتاد
- عند إعادة فتح المودال → ستُفتح الكل من جديد

