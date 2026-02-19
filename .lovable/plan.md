

# صفحة نماذج - مستكشف ملفات مع محرر PDF/صور

## الفكرة العامة

صفحة جديدة تعمل كمستكشف ملفات (File Explorer) مع إمكانية:
- إنشاء مجلدات متداخلة (مثلاً: نموذج نقل تامين > شركة الاوسط)
- رفع ملفات PDF وصور داخل المجلدات
- تحرير الملفات بإضافة نصوص على أي صفحة من PDF أو على الصورة
- حفظ مواقع النصوص للرجوع إليها لاحقاً
- نسخ (Duplicate) الملفات مع حقولها
- طباعة الملف مع النصوص المضافة
- إعادة تسمية وحذف المجلدات والملفات
- جميع الملفات تُرفع وتُخدم من Bunny CDN

## تصميم قاعدة البيانات

### جدول: `form_template_folders`
```text
id              UUID (PK)
parent_id       UUID (FK -> self, nullable) -- للمجلدات المتداخلة
name            TEXT NOT NULL
created_by      UUID (FK -> profiles)
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### جدول: `form_template_files`
```text
id              UUID (PK)
folder_id       UUID (FK -> form_template_folders)
name            TEXT NOT NULL
file_url        TEXT NOT NULL -- رابط CDN
file_type       TEXT NOT NULL -- 'pdf' | 'image'
mime_type       TEXT
overlay_fields  JSONB -- مواقع النصوص المضافة: [{id, page, x, y, text, fontSize}]
created_by      UUID (FK -> profiles)
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### RLS
- سياسات قراءة وكتابة للمستخدمين المعتمدين (profiles.status = 'approved')

## هيكل الصفحات والملفات

### ملفات جديدة:
1. **`src/pages/FormTemplates.tsx`** - الصفحة الرئيسية (مستكشف الملفات)
2. **`src/pages/FormTemplateEditor.tsx`** - محرر الملف (PDF/صورة مع overlay نصوص)

### ملفات تُعدّل:
3. **`src/App.tsx`** - إضافة route جديد `/form-templates` و `/form-templates/edit/:fileId`
4. **`src/components/layout/Sidebar.tsx`** - إضافة رابط "نماذج" في القائمة الجانبية

## تفصيل صفحة المستكشف (`FormTemplates.tsx`)

### واجهة المستخدم:
- **شريط العنوان**: عنوان الصفحة + breadcrumb للتنقل بين المجلدات
- **شريط الأدوات**: أزرار (مجلد جديد، رفع ملف)
- **الجدول**: يعرض المجلدات والملفات بأيقوناتها
  - المجلدات: أيقونة مجلد، الاسم، تاريخ الإنشاء، أزرار (إعادة تسمية، حذف)
  - الملفات: أيقونة حسب النوع، الاسم، النوع، تاريخ الإنشاء، أزرار (تحرير، نسخ، إعادة تسمية، حذف)
- **النقر على مجلد**: يفتح المجلد ويعرض محتوياته
- **النقر على ملف**: يفتح المحرر

### الوظائف:
- إنشاء مجلد (Dialog لإدخال الاسم)
- رفع ملف (FileUploader الموجود مع accept لـ PDF وصور)
- إعادة تسمية (inline edit أو Dialog)
- حذف (تأكيد ثم حذف)
- نسخ ملف (duplicate مع overlay_fields)

## تفصيل صفحة المحرر (`FormTemplateEditor.tsx`)

### مبني على نفس منطق AccidentTemplateMapper:
- تحميل PDF عبر pdf.js CDN + proxy أو عرض الصورة مباشرة
- عرض كل صفحات PDF كصور مع اختيار الصفحة الحالية
- **إضافة نص**: زر "إضافة نص" ثم النقر على الموقع المطلوب
- **تحريك النص**: سحب وإفلات (drag & drop)
- **تعديل النص**: النقر المزدوج لتغيير المحتوى
- **تغيير حجم الخط**: عبر لوحة الخصائص الجانبية
- **حذف نص**: زر حذف على كل عنصر
- **تكبير/تصغير**: أزرار zoom
- **التنقل بين الصفحات**: أزرار السابق/التالي + thumbnails
- **حفظ**: يحفظ `overlay_fields` في قاعدة البيانات
- **طباعة**: يفتح نافذة الطباعة مع النصوص المركبة

### هيكل `overlay_fields` (JSONB):
```text
[
  { id: "field_1", page: 0, x: 120, y: 340, text: "نص تجريبي", fontSize: 14 },
  { id: "field_2", page: 1, x: 50, y: 100, text: "نص آخر", fontSize: 12 },
  ...
]
```

## التفاصيل التقنية

### Route في App.tsx:
```text
/form-templates          -> FormTemplates.tsx (المستكشف)
/form-templates/edit/:id -> FormTemplateEditor.tsx (المحرر)
```

### رابط في Sidebar.tsx:
يُضاف تحت مجموعة "أخرى" بجانب "الوسائط":
```text
{ name: "نماذج", href: "/form-templates", icon: FileText }
```

### رفع الملفات:
يستخدم نفس `FileUploader` الموجود مع `entityType: "form_template"` ويحفظ رابط CDN في `form_template_files.file_url`

### عرض PDF:
يستخدم نفس طريقة `AccidentTemplateMapper`:
- تحميل pdf.js من CDN
- جلب الملف عبر `proxy-cdn-file` edge function
- تحويل كل صفحة لصورة عبر canvas
- عرض النصوص كطبقة فوقية (overlay) قابلة للسحب

### الطباعة:
فتح نافذة جديدة تحتوي على صور الصفحات مع النصوص مركبة عليها بـ CSS ثم `window.print()`

### لا تغييرات على edge functions
كل شيء يستخدم البنية الموجودة (upload-media، proxy-cdn-file)

