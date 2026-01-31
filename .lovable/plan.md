
# خطة: نظام المراسلات (التوريسات)

## الفكرة العامة

المدير يريد إنشاء رسائل رسمية (توريسة) لإرسالها للشركات أو الأفراد. كل رسالة تحتوي على:
- **رأس الصفحة:** شعار AB
- **المحتوى:** نص HTML مُنسَّق (صور، Bold، قوائم...)
- **ذيل الصفحة:** معلومات الشركة AB

ثم يمكن:
- إرسال الرسالة عبر SMS (رابط للرسالة)
- طباعة الرسالة
- إدارة الرسائل (إضافة/تعديل/حذف/عرض)

---

## هيكل البيانات

### جدول جديد: `correspondence_letters`

| العمود | النوع | الوصف |
|--------|------|-------|
| id | uuid | المعرف الأساسي |
| title | text | عنوان الرسالة (داخلي) |
| recipient_name | text | اسم المستلم (شركة/شخص) |
| recipient_phone | text | رقم هاتف المستلم (اختياري) |
| body_html | text | محتوى الرسالة (HTML) |
| generated_url | text | رابط الرسالة على CDN |
| status | text | الحالة (draft/sent/viewed) |
| sent_at | timestamptz | تاريخ الإرسال |
| created_by_admin_id | uuid | من أنشأ الرسالة |
| branch_id | uuid | الفرع (اختياري) |
| created_at | timestamptz | تاريخ الإنشاء |
| updated_at | timestamptz | تاريخ التحديث |

---

## المكونات الجديدة

### 1) صفحة الرسائل: `src/pages/CorrespondenceLetters.tsx`

**الميزات:**
- جدول يعرض جميع الرسائل
- بحث وفلترة بالحالة
- أزرار: إضافة جديد، عرض، تعديل، حذف، إرسال SMS، طباعة

**هيكل الصفحة:**
```
┌─────────────────────────────────────────┐
│  التوريسات                    [+ جديد]  │
├─────────────────────────────────────────┤
│ [بحث...] [كل] [مسودة] [مُرسل]           │
├─────────────────────────────────────────┤
│ العنوان    المستلم    الحالة   إجراءات  │
│ ───────────────────────────────────────  │
│ رسالة 1   شركة X    مُرسل    👁️✏️🗑️📱  │
│ رسالة 2   أحمد      مسودة   👁️✏️🗑️📱  │
└─────────────────────────────────────────┘
```

### 2) مكون المحرر: `src/components/correspondence/LetterEditor.tsx`

**محرر HTML بسيط مع:**
- شريط أدوات: Bold, Italic, Underline, قائمة، رابط
- زر رفع صورة
- معاينة فورية

**الهيكل:**
```
┌─────────────────────────────────────────┐
│ [B] [I] [U] [📷] [🔗] [☰]              │
├─────────────────────────────────────────┤
│                                         │
│     [منطقة الكتابة - Textarea]         │
│                                         │
└─────────────────────────────────────────┘
```

### 3) مكون المعاينة: `src/components/correspondence/LetterPreview.tsx`

**معاينة الرسالة الكاملة مع:**
- شعار AB في الأعلى
- المحتوى في الوسط
- تذييل AB في الأسفل

### 4) Drawer للإنشاء/التعديل: `src/components/correspondence/LetterDrawer.tsx`

**الحقول:**
- عنوان الرسالة (داخلي)
- اسم المستلم
- رقم الهاتف (اختياري)
- محرر المحتوى
- معاينة

---

## Edge Functions

### 1) `generate-correspondence-html/index.ts`

**الوظيفة:** إنشاء ملف HTML على CDN

**المدخلات:**
```typescript
{
  letter_id: string;
}
```

**العمل:**
1. جلب بيانات الرسالة من قاعدة البيانات
2. جلب إعدادات الشركة (الشعار، معلومات التذييل)
3. بناء HTML كامل مع التنسيق
4. رفع إلى BunnyCDN بمسار ثابت: `correspondence/{letter_id}/letter.html`
5. تحديث `generated_url` في قاعدة البيانات
6. Purge CDN cache

**HTML Template:**
```html
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; }
    .header img { max-height: 100px; }
    .content { line-height: 1.8; min-height: 400px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <img src="{{LOGO_URL}}" alt="AB Insurance" />
  </div>
  <div class="content">
    {{BODY_HTML}}
  </div>
  <div class="footer">
    <p>{{COMPANY_NAME}}</p>
    <p>{{PHONE_LINKS}}</p>
  </div>
</body>
</html>
```

### 2) `send-correspondence-sms/index.ts`

**الوظيفة:** إرسال رابط الرسالة عبر SMS

**المدخلات:**
```typescript
{
  letter_id: string;
  phone_number: string; // يمكن تجاوز الرقم المحفوظ
}
```

**العمل:**
1. التحقق من المصادقة
2. جلب بيانات الرسالة
3. إذا لم يكن `generated_url` موجود → إنشاء HTML أولاً
4. إرسال SMS عبر 019sms
5. تحديث `status` إلى "sent" و `sent_at`
6. تسجيل في `sms_logs`

**رسالة SMS:**
```
رسالة من مكتب بشير للتأمين:
{{RECIPIENT_NAME}}

للاطلاع على الرسالة:
{{LETTER_URL}}
```

---

## التكامل مع الواجهة

### إضافة Route جديد في `App.tsx`

```tsx
<Route path="/admin/correspondence" element={
  <AdminRoute>
    <CorrespondenceLetters />
  </AdminRoute>
} />
```

### إضافة رابط في Sidebar

في مجموعة "الإعدادات" أو "إدارة":
```tsx
{
  href: "/admin/correspondence",
  label: "التوريسات",
  icon: Mail
}
```

---

## ميزة الطباعة

**من صفحة المعاينة:**
- زر "طباعة" يفتح `window.print()` على الـ HTML المُنشأ
- أو يفتح الرابط في نافذة جديدة مع إضافة `?print=1` للطباعة التلقائية

**في HTML المُنشأ:**
```javascript
if (window.location.search.includes('print=1')) {
  window.onload = () => window.print();
}
```

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `src/pages/CorrespondenceLetters.tsx` | جديد | صفحة إدارة الرسائل |
| `src/components/correspondence/LetterDrawer.tsx` | جديد | Drawer للإنشاء/التعديل |
| `src/components/correspondence/LetterEditor.tsx` | جديد | محرر HTML بسيط |
| `src/components/correspondence/LetterPreview.tsx` | جديد | معاينة الرسالة |
| `supabase/functions/generate-correspondence-html/index.ts` | جديد | إنشاء HTML على CDN |
| `supabase/functions/send-correspondence-sms/index.ts` | جديد | إرسال SMS |
| `src/App.tsx` | تعديل | إضافة Route |
| `src/components/layout/Sidebar.tsx` | تعديل | إضافة رابط |
| `supabase/config.toml` | تعديل | إضافة Edge Functions |
| **Migration** | جديد | إنشاء جدول `correspondence_letters` |

---

## تدفق العمل

```text
1. المدير يفتح صفحة "التوريسات"
2. يضغط "+ جديد"
3. يملأ البيانات:
   - العنوان: "خطاب للشركة س"
   - المستلم: "شركة س للتأمين"
   - الهاتف: "0501234567"
   - المحتوى: [يكتب النص + يضيف صور...]
4. يضغط "حفظ" → الرسالة تُحفظ كمسودة
5. يضغط "معاينة" → يرى الشكل النهائي مع الشعار والتذييل
6. يضغط "إرسال SMS" → يُنشئ HTML على CDN ويُرسل الرابط
7. أو يضغط "طباعة" → يطبع مباشرة
```

---

## تفاصيل تقنية

### محرر HTML البسيط

بدلاً من استخدام مكتبة ثقيلة، سنستخدم `contenteditable` مع أوامر `document.execCommand`:

```tsx
function LetterEditor({ value, onChange }) {
  const editorRef = useRef<HTMLDivElement>(null);
  
  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    onChange(editorRef.current?.innerHTML || '');
  };
  
  return (
    <div>
      <div className="toolbar">
        <button onClick={() => execCommand('bold')}>B</button>
        <button onClick={() => execCommand('italic')}>I</button>
        <button onClick={() => execCommand('underline')}>U</button>
        <button onClick={() => execCommand('insertUnorderedList')}>☰</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        className="editor"
        dangerouslySetInnerHTML={{ __html: value }}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
```

### رفع الصور

استخدام نفس pattern الموجود في `MarketingSms.tsx`:

```tsx
const handleImageUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entity_type', 'correspondence');
  
  const { data } = await supabase.functions.invoke('upload-media', {
    body: formData,
  });
  
  // Insert image at cursor
  document.execCommand('insertImage', false, data.file.cdn_url);
};
```

---

## الأمان

- **RLS على الجدول:** فقط المديرين يمكنهم الإنشاء/التعديل/الحذف
- **Edge Functions:** التحقق من صلاحية المستخدم (admin)
- **Sanitization:** تنظيف HTML قبل الحفظ باستخدام DOMPurify
- **الرابط العام:** أي شخص لديه الرابط يمكنه عرض الرسالة (مثل الفواتير)

---

## Migration SQL

```sql
-- Create correspondence_letters table
CREATE TABLE correspondence_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  body_html TEXT,
  generated_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed')),
  sent_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES auth.users(id),
  branch_id UUID REFERENCES branches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE correspondence_letters ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can manage
CREATE POLICY "Admins can manage correspondence" ON correspondence_letters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Add to realtime (optional)
ALTER PUBLICATION supabase_realtime ADD TABLE correspondence_letters;

-- Index for quick lookups
CREATE INDEX idx_correspondence_status ON correspondence_letters(status);
CREATE INDEX idx_correspondence_created_at ON correspondence_letters(created_at DESC);
```
