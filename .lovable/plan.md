

# خطة إصلاح توقيع العميل وإضافة المرفقات لـ PDF بلاغ الحادث

## المشاكل المكتشفة

### المشكلة الأولى: توقيع العميل
الكود الحالي في السطر 387 يعرض فقط "✓ تم التوقيع" كنص بدلاً من **صورة التوقيع الفعلية**:
```typescript
values.customer_signature = report.customer_signature_url ? "✓ تم التوقيع" : "";
```

**الإصلاح**: يجب تعديل الكود ليعرض صورة التوقيع كـ `<img>` في المكان المحدد في القالب.

### المشكلة الثانية: ملفات الحادث
لا يوجد كود في `generate-accident-pdf` لجلب الملفات من جدول `accident_report_files` وإضافتها للـ PDF. 

البيانات موجودة بالفعل:
- `c220d142-712f-4302-8a6a-1299faf55c86` يحتوي على:
  - PDF: טופס 29
  - صورة: WhatsApp Image

---

## التغييرات المطلوبة

### 1. تحديث `generate-accident-pdf/index.ts`

#### جلب ملفات الحادث
إضافة query لجلب الملفات المرفقة:
```typescript
const { data: attachedFiles } = await supabase
  .from("accident_report_files")
  .select("file_url, file_name, file_type")
  .eq("accident_report_id", accident_report_id)
  .order("created_at");
```

#### معالجة حقل توقيع العميل كصورة
تغيير طريقة عرض `customer_signature` من نص إلى صورة:
- في `buildFieldValues()`: تمرير URL التوقيع كما هو
- في `generateHtmlOverlayReport()`: التعرف على حقل `customer_signature` وعرضه كـ `<img>` بدلاً من نص

#### إضافة المرفقات كصفحات إضافية
إضافة قسم "المرفقات" في نهاية الـ HTML:
- عرض كل صورة مرفقة في صفحة منفصلة
- عرض روابط ملفات PDF مع إمكانية فتحها

### 2. تحديث Template Mapper (اختياري)
إضافة نوع حقل جديد `type: "image"` لحقل التوقيع ليكون مختلفاً عن الحقول النصية.

---

## التفاصيل التقنية

### معالجة حقل التوقيع
```typescript
// في buildFieldValues - تمرير URL كما هو
values.customer_signature = report.customer_signature_url || "";

// في generateHtmlOverlayReport - عرض كصورة إذا كان حقل التوقيع
if (field.id === 'customer_signature' && field.value && field.value.startsWith('http')) {
  // عرض كصورة بدلاً من نص
  return `<img src="${field.value}" style="max-height: ${fontSize * 3}px; object-fit: contain;" />`;
}
```

### إضافة المرفقات كصفحات
```html
<!-- بعد صفحات القالب -->
<div class="attachments-section" style="page-break-before: always;">
  <h2>المرفقات</h2>
  <!-- صور -->
  <div class="attachment-image">
    <img src="..." style="max-width: 100%; max-height: 90vh;" />
    <p>صورة 1</p>
  </div>
  <!-- روابط PDF -->
  <div class="attachment-link">
    <a href="...">📄 ملف PDF</a>
  </div>
</div>
```

---

## الملفات المتأثرة

| الملف | نوع التغيير |
|-------|-------------|
| `supabase/functions/generate-accident-pdf/index.ts` | تعديل كبير |

---

## سير العمل بعد التعديل

```text
1. الموظف يضغط "إنشاء PDF"
2. النظام يجلب بيانات البلاغ + المرفقات
3. يعالج حقل التوقيع كصورة (إذا وُجد)
4. يولد صفحات القالب مع النصوص
5. يضيف صفحات المرفقات في النهاية:
   - كل صورة في صفحة منفصلة (للطباعة)
   - روابط ملفات PDF
6. يرفع الملف إلى CDN
7. يعود برابط PDF الجديد
```

---

## ملاحظات
- الصور ستظهر في صفحات منفصلة عند الطباعة
- ملفات PDF المرفقة ستظهر كروابط (لأن دمجها يحتاج معالجة معقدة)
- صورة التوقيع ستظهر في المكان المحدد في القالب بحجم مناسب

