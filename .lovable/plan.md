

# إصلاح خطأ رفع الملفات في صفحة النماذج

## المشكلة

عند رفع ملف PDF، يظهر خطأ:
`null value in column "file_url" of relation "form_template_files" violates not-null constraint`

السبب: دالة `upload-media` تُرجع كائن من جدول `media_files` بحقول `cdn_url` و `original_name` و `mime_type`، لكن الكود يستخدم `f.url` و `f.file_name` اللتان لا تُوجدان في النتيجة.

## الحل

تعديل بسيط في `handleUploadComplete` بملف `src/pages/FormTemplates.tsx` لاستخدام أسماء الحقول الصحيحة:

- `f.url` يصبح `f.cdn_url`
- `f.file_name` يصبح `f.original_name`

## التفاصيل التقنية

### ملف: `src/pages/FormTemplates.tsx` (سطر 234-244)

تغيير الـ mapping داخل `handleUploadComplete`:

```js
const rows = uploadedFiles.map((f) => {
  const isPdf = f.mime_type === "application/pdf" || f.original_name?.toLowerCase().endsWith(".pdf");
  return {
    folder_id: currentFolderId,
    name: f.original_name || "ملف",
    file_url: f.cdn_url,
    file_type: isPdf ? "pdf" : "image",
    mime_type: f.mime_type || null,
    overlay_fields: [],
    created_by: profile?.id,
  };
});
```

### لا تغييرات في قاعدة البيانات
