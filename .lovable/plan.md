
# إضافة رابط مباشر لكل عميل (`/clients/:id`)

## المشكلة
حالياً عندما تفتح عميل، الرابط يبقى `/clients` فقط - لا يمكنك نسخ الرابط وإرساله لعامل آخر.

## الحل
إضافة route جديد `/clients/:id` يفتح تفاصيل العميل مباشرة.

## التغييرات

### 1. ملف `src/App.tsx`
إضافة route جديد:
```text
<Route path="/clients/:clientId" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
```

### 2. ملف `src/pages/Clients.tsx`
- استيراد `useParams` من react-router-dom
- قراءة `clientId` من الـ URL params
- عند فتح عميل من الجدول: استخدام `navigate(/clients/${client.id})` بدل query params
- عند فتح عميل من الـ URL param: تحميل بيانات العميل وفتح تفاصيله
- عند إغلاق تفاصيل العميل: العودة لـ `/clients`
- الحفاظ على التوافق مع الروابط القديمة (`?open=...`) بحيث تعمل أيضاً

### 3. تحديث الروابط في باقي الصفحات
تغيير كل الأماكن التي تستخدم `/clients?open={id}` إلى `/clients/{id}`:
- `src/components/dashboard/RecentActivity.tsx`
- `src/components/layout/GlobalPolicySearch.tsx`
- `src/components/notifications/PaymentDetailsPanel.tsx`
- `src/components/policies/PolicyWizard.tsx`
- `src/pages/CompanySettlementDetail.tsx`
- `src/pages/PolicyReports.tsx`

## النتيجة
- كل عميل سيكون له رابط مثل: `https://basheer-ab.lovable.app/clients/abc-123`
- يمكنك نسخ الرابط وإرساله لأي عامل آخر
- الروابط القديمة (`?open=...`) ستبقى تعمل للتوافق
