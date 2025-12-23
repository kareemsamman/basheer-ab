# دليل نقل AB Insurance CRM إلى Supabase خارجي

## المتطلبات

1. حساب على [supabase.com](https://supabase.com) (مجاني)
2. سيرفر Plesk مع Node.js أو Static Hosting
3. نسخة من الكود على GitHub
4. Supabase CLI (للـ Edge Functions)

---

## الخطوة 1: إنشاء مشروع Supabase جديد

1. اذهب إلى [supabase.com](https://supabase.com)
2. اضغط "Start your project"
3. سجّل دخول بـ GitHub
4. اضغط "New project"
5. اختر:
   - **Name**: ab-insurance-crm
   - **Database Password**: كلمة مرور قوية (احفظها!)
   - **Region**: اختر الأقرب لموقعك
6. انتظر إنشاء المشروع (2-3 دقائق)

---

## الخطوة 2: تشغيل migration.sql

1. في Supabase Dashboard → SQL Editor
2. اضغط "New query"
3. انسخ محتوى ملف `migration.sql` كاملاً
4. الصق في المحرر
5. اضغط "Run"
6. تأكد من عدم وجود أخطاء

---

## الخطوة 3: إعداد Google OAuth

1. في Supabase Dashboard → Authentication → Providers
2. فعّل Google
3. في [Google Cloud Console](https://console.cloud.google.com):
   - أنشئ OAuth 2.0 Client ID
   - أضف Redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
4. انسخ Client ID و Client Secret إلى Supabase

---

## الخطوة 4: تصدير البيانات

1. في Lovable → صفحة نقل قاعدة البيانات
2. اضغط "تصدير البيانات"
3. احفظ الملف JSON

---

## الخطوة 5: نسخ API Keys

من Supabase Dashboard → Settings → API:

```env
# انسخ هذه القيم
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...YOUR_ANON_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

---

## الخطوة 6: تحديث الكود

### 6.1 إنشاء ملف .env

```bash
# في مجلد المشروع
cp .env.example .env
```

### 6.2 تعديل قيم .env

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

---

## الخطوة 7: استيراد البيانات

### الطريقة 1: من الواجهة (بعد النشر)
1. ارفع المشروع على Plesk
2. اذهب إلى صفحة نقل قاعدة البيانات
3. استخدم تبويب "استيراد البيانات"
4. ارفع ملف JSON

### الطريقة 2: من Supabase Dashboard
1. اذهب إلى Table Editor
2. لكل جدول → Import data from CSV/JSON

---

## الخطوة 8: نشر Edge Functions

### 8.1 تثبيت Supabase CLI

```bash
npm install -g supabase
```

### 8.2 تسجيل الدخول

```bash
supabase login
```

### 8.3 ربط المشروع

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### 8.4 إعداد الـ Secrets

```bash
# Bunny CDN
supabase secrets set BUNNY_API_KEY=your-bunny-api-key
supabase secrets set BUNNY_STORAGE_ZONE=your-storage-zone
supabase secrets set BUNNY_CDN_URL=https://your-cdn.b-cdn.net
```

### 8.5 نشر الـ Functions

```bash
supabase functions deploy
```

---

## الخطوة 9: بناء ونشر على Plesk

### 9.1 بناء المشروع

```bash
npm install
npm run build
```

### 9.2 رفع إلى Plesk

1. ارفع محتويات مجلد `dist` إلى public_html
2. تأكد من إعداد:
   - الصفحة الرئيسية: `index.html`
   - Error Document: `index.html` (للـ SPA routing)

---

## الخطوة 10: إعداد الدومين (اختياري)

1. في Plesk → أضف الدومين
2. في Supabase → Settings → Custom Domains (إذا أردت)

---

## ملاحظات مهمة

### الصور على Bunny CDN
- ستبقى تعمل بنفس الروابط
- لا تحتاج نقل الصور

### المستخدمين
- المستخدمون الحاليون يحتاجون تسجيل دخول جديد
- البيانات ستكون موجودة لكن auth.users جدول منفصل
- يمكنهم التسجيل بنفس الإيميل وسيتم ربطهم تلقائياً بناءً على id_number

### Edge Functions
كل الـ functions موجودة في `supabase/functions/`:
- check-expiring-policies
- delete-media
- fetch-car-price
- fetch-vehicle
- generate-invoice-pdf
- generate-invoices
- generate-pdf
- get-signature-info
- payment-result
- send-invoice-sms
- send-signature-sms
- send-sms
- signature-page
- submit-signature
- tranzila-init
- tranzila-status
- tranzila-webhook
- upload-media
- wordpress-import

---

## استكشاف الأخطاء

### خطأ في RLS
- تأكد من تسجيل الدخول
- تأكد من أن المستخدم active وله role

### Edge Function لا تعمل
- تحقق من Secrets في Supabase Dashboard
- راجع Logs في Functions → Logs

### الصور لا تظهر
- تأكد من أن Bunny CDN يعمل
- تحقق من CORS settings في Bunny

---

## الدعم

إذا واجهت مشاكل:
1. راجع Supabase Logs
2. تحقق من Console في المتصفح
3. تأكد من إعدادات .env

---

## تكلفة Supabase المجاني

- 500MB Database
- 1GB File Storage
- 2GB Bandwidth
- 50,000 Monthly Active Users
- Unlimited API Requests

هذا يكفي لمعظم الاستخدامات الصغيرة والمتوسطة.
