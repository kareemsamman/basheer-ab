

# تنفيذ خاصية Click-to-Call (الاتصال بالضغط)

## نظرة عامة
تنفيذ خاصية Click-to-Call التي تسمح للمستخدمين بالاتصال بالعملاء مباشرة من خلال نظام IPPBX عند الضغط على رقم هاتف العميل في أي صفحة.

---

## كيف ستعمل الخاصية

```text
+------------------+     +-------------------+     +------------------+
|   واجهة المستخدم  |     |   Edge Function   |     |    IPPBX API     |
|   (Frontend)     |     |   (Backend)       |     |   (PBX System)   |
+--------+---------+     +---------+---------+     +--------+---------+
         |                         |                        |
    1. ضغط على رقم الهاتف          |                        |
         |                         |                        |
    2. ظهور نافذة تأكيد            |                        |
         |                         |                        |
    3. إرسال الطلب ------------------>                      |
         |            (phone + extension)                   |
         |                         |                        |
         |      4. إضافة Secrets ---->                      |
         |        (token + password)                        |
         |                         |                        |
         |                    5. POST Request ------------->
         |                         |                        |
         |                    <--------------- 6. Response  |
         |                         |                        |
    <------------------- 7. عرض نتيجة                       |
         |                         |                        |
+--------+---------+     +---------+---------+     +--------+---------+
```

---

## المكونات المطلوبة

### 1. Supabase Secrets (المفاتيح السرية)
سيتم إضافة المفاتيح التالية كـ Secrets:
- `IPPBX_TOKEN_ID` - رمز التوثيق للـ PBX
- `IPPBX_EXTENSION_PASSWORD` - كلمة مرور التحويلة (MD5)

### 2. تعديل قاعدة البيانات
إضافة حقل `pbx_extension` لجدول `profiles` لحفظ رقم التحويلة لكل موظف.

### 3. Edge Function جديدة
إنشاء `click2call` Edge Function تقوم بـ:
- استقبال رقم الهاتف ورقم التحويلة من الواجهة
- إضافة Token ID و Extension Password من Secrets
- إرسال الطلب إلى IPPBX API
- إرجاع النتيجة للواجهة

### 4. مكون ClickablePhone
مكون React قابل لإعادة الاستخدام يعرض رقم الهاتف ويفتح نافذة تأكيد عند الضغط.

### 5. مكون Click2CallDialog
نافذة حوار للتأكيد قبل إجراء الاتصال.

---

## التفاصيل التقنية

### A) Edge Function: `click2call`

```text
POST /functions/v1/click2call
Authorization: Bearer <user_token>

Body:
{
  "phone_number": "052XXXXXXX",
  "extension_number": "101"  // (اختياري - يُستخرج من profile إذا لم يُرسل)
}

Response:
{
  "success": true,
  "status": "SUCCESS",
  "message": "تم بدء الاتصال"
}
```

**المنطق الداخلي:**
1. التحقق من صلاحية المستخدم (JWT)
2. جلب رقم التحويلة من `profiles.pbx_extension` إذا لم يُرسل
3. جلب `IPPBX_TOKEN_ID` و `IPPBX_EXTENSION_PASSWORD` من Secrets
4. إرسال طلب POST إلى `https://master.ippbx.co.il/ippbx_api/v1.4/api/info/click2call`
5. إرجاع النتيجة للمستخدم

### B) تعديل جدول profiles

```sql
ALTER TABLE profiles 
ADD COLUMN pbx_extension TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.pbx_extension IS 'رقم تحويلة PBX للموظف';
```

### C) مكون ClickablePhone

```text
Props:
- phone: string (رقم الهاتف)
- className?: string (تنسيق إضافي)
- showIcon?: boolean (إظهار أيقونة الهاتف)

السلوك:
- يعرض رقم الهاتف كرابط قابل للضغط
- عند الضغط: يفتح Dialog للتأكيد
- بعد التأكيد: يستدعي Edge Function
- يعرض Toast بالنتيجة
```

### D) Click2CallDialog

```text
Props:
- open: boolean
- onOpenChange: (open: boolean) => void
- phoneNumber: string
- onSuccess?: () => void

المحتوى:
- عنوان: "هل تريد الاتصال؟"
- رقم الهاتف المعروض
- زر "اتصال" (أخضر)
- زر "إلغاء"
- حالة تحميل أثناء الاتصال
```

---

## صفحة إعدادات PBX

إضافة قسم في صفحة `/admin/auth-settings` أو إنشاء صفحة جديدة `/admin/pbx-settings` لـ:
- عرض حالة تكوين PBX (مفعل/معطل)
- إدارة أرقام التحويلات للموظفين
- اختبار الاتصال

---

## أين سيُستخدم المكون؟

سيتم استبدال عرض رقم الهاتف العادي بـ `<ClickablePhone>` في:

1. **صفحة العملاء** `/clients` - أرقام الهواتف في الجدول
2. **تفاصيل العميل** `ClientDetails.tsx` - رقم الهاتف الرئيسي والثانوي
3. **صفحة الوثائق** `/policies` - رقم هاتف العميل
4. **صفحة الوسطاء** `/brokers` - أرقام هواتف الوسطاء
5. **أي مكان آخر يظهر فيه رقم هاتف**

---

## ملخص الملفات

| الملف | الوصف |
|-------|-------|
| `supabase/functions/click2call/index.ts` | Edge Function للاتصال بـ IPPBX |
| `supabase/config.toml` | إضافة تكوين الـ function |
| `src/components/shared/ClickablePhone.tsx` | مكون رقم الهاتف القابل للضغط |
| `src/components/shared/Click2CallDialog.tsx` | نافذة تأكيد الاتصال |
| `src/pages/Clients.tsx` | استخدام ClickablePhone |
| `src/components/clients/ClientDetails.tsx` | استخدام ClickablePhone |
| `src/pages/AdminUsers.tsx` | إضافة حقل رقم التحويلة للمستخدمين |
| Migration SQL | إضافة حقل `pbx_extension` لجدول profiles |

---

## الأمان

- **Token و Password**: لا يُرسلان من الواجهة - يُجلبان من Supabase Secrets في الـ Backend فقط
- **التحقق من الصلاحيات**: فقط المستخدمين النشطين يمكنهم الاتصال
- **تسجيل النشاط**: يمكن إضافة log لكل محاولة اتصال (اختياري)

---

## الخطوات للتنفيذ

1. إضافة Secrets (IPPBX_TOKEN_ID, IPPBX_EXTENSION_PASSWORD)
2. إنشاء Migration لإضافة حقل `pbx_extension`
3. إنشاء Edge Function `click2call`
4. إنشاء مكونات React (ClickablePhone, Click2CallDialog)
5. تحديث صفحة العملاء وباقي الصفحات
6. إضافة حقل التحويلة في صفحة إدارة المستخدمين

