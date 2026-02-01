
## الهدف
إرجاع **بادج عدد العملاء المدينين** بجانب “متابعة الديون” كما كان سابقاً، مع إصلاح السبب الجذري الذي جعل العدّاد يختفي بعد تعديلات الديون الأخيرة.

---

## التشخيص (لماذا اختفى البادج؟)
### 1) تضارب (Overload) في دالة الملخص
حالياً في قاعدة البيانات يوجد **نسختان** من الدالة:
- `report_client_debts_summary()` (بدون باراميترات)
- `report_client_debts_summary(p_search text DEFAULT NULL, p_filter_days int DEFAULT NULL)` (مع باراميترات)

لذلك أي استدعاء “بدون باراميترات” يصبح **غير محدد** (ambiguous) ويؤدي لخطأ مثل:
- `function public.report_client_debts_summary() is not unique`

Hook البادج `useDebtCount()` يستدعي:
- `supabase.rpc('report_client_debts_summary')` بدون باراميترات  
فعندما يفشل الاستدعاء، يبقى `debtCount=0` وبالتالي البادج لا يُعرض.

### 2) (مهم) يوجد أيضاً نسختان من `report_client_debts`
وهذا يسبب لبس ويُعرض التطبيق لأخطاء “يشتغل هنا ويخرب هناك”، خصوصاً لأن صفحة `/debt-tracking` تعتمد على توقيع محدد للدالة (p_search/p_filter_days/p_limit/p_offset) بينما تم إنشاء توقيع آخر مختلف.

---

## الحل المقترح (حل سريع + حل جذري صحيح)
### A) إصلاح سريع لرجوع البادج فوراً (Frontend)
تعديل `useDebtCount.tsx` ليقوم باستدعاء الدالة **مع باراميترات صريحة** حتى يختار توقيع الدالة الصحيح دائماً:

- استدعاء:
  - `report_client_debts_summary({ p_search: null, p_filter_days: null })`
- ثم قراءة `total_clients` من أول صف.

هذا وحده سيُرجع البادج حتى قبل تنظيف قاعدة البيانات.

### B) إصلاح جذري (Backend) لمنع تكرار المشكلة + توحيد المنطق
إنشاء Migration جديدة تقوم بـ:
1) حذف النسخ “الغلط/الزائدة” التي تسبب التضارب:
   - `DROP FUNCTION IF EXISTS public.report_client_debts_summary();`
   - `DROP FUNCTION IF EXISTS public.report_client_debts(uuid, text, text, integer, integer);`
2) إعادة تعريف الدوال **بالتواقيع التي يعتمد عليها الـ UI حالياً** (كما في صفحة DebtTracking):
   - `public.report_client_debts(p_search, p_filter_days, p_limit, p_offset)` (يعيد total_rows…)
   - `public.report_client_debts_summary(p_search, p_filter_days)` (يعيد total_clients, total_owed…)
   - `public.report_debt_policies_for_clients(p_client_ids)` (يعيد الأعمدة التي تتوقعها الصفحة: policy_number, paid, remaining, days_until_expiry, status…)
3) دمج منطق “حساب الدين على مستوى الباقة group_id” داخل هذه الدوال **بدون تغيير أسماء الأعمدة أو التواقيع** (لأن الواجهة تعتمد عليها).
4) إعادة إضافة شروط الصلاحيات كما كانت:
   - `is_active_user(auth.uid())`
   - `can_access_branch(auth.uid(), c.branch_id)`
   - مع استثناء broker_id وسياسات ELZAMI وفق المنطق المتّبع.

---

## تفاصيل التنفيذ (ما الذي سيتغير بالضبط؟)
### 1) Frontend: `src/hooks/useDebtCount.tsx`
- تغيير الاستدعاء من بدون باراميترات إلى مع باراميترات:
  - `supabase.rpc('report_client_debts_summary', { p_search: null, p_filter_days: null })`
- الإبقاء على نفس السلوك: تحديث كل 30 ثانية + عند Focus.
- (اختياري) إذا لم يكن المستخدم مسجلاً الدخول، لا نحاول الاستدعاء (لتجنب أخطاء صامتة).

### 2) Backend Migration: توحيد الدوال
#### report_client_debts / report_client_debts_summary
- بدلاً من حساب “remaining” لكل Policy منفردة داخل الباقة، سنحسب:
  - للباقة: `group_remaining = SUM(prices) - SUM(payments)` على مستوى `client_id + group_id`
  - للسياسات المنفردة: `remaining = price - payments` كما كان
- ثم:
  - `total_owed` للعميل = مجموع (group_remaining + single_remaining) مع `GREATEST(0, …)`

#### report_debt_policies_for_clients (المهم لعرض التفاصيل)
- سنعيد الأعمدة التي تتوقعها الصفحة تماماً:
  - `client_id, policy_id, policy_number, insurance_price, paid, remaining, end_date, days_until_expiry, status, policy_type_parent, policy_type_child, car_number, group_id`
- للباقة: نعرض صفوف لكل Policy داخل الباقة، لكن “paid/remaining” سيتم توزيعها بشكل متناسق حتى:
  - مجموع remaining عبر مكونات الباقة = group_remaining
  - لا يظهر “دين” وهمي على مكون بسبب أن الدفع تم تسجيله على مكون آخر
- إبقاء Badge “باقة” في UI يعمل كما هو.

---

## لماذا هذا سيُرجع البادج “مثل قبل”؟
- البادج يعتمد على `useDebtCount` → كان يستدعي دالة ملخص بدون باراميترات
- بعد التعديل سيستدعي الملخص مع باراميترات محددة → لن يحدث تضارب → يرجع `total_clients` → يظهر البادج
- وبعد تنظيف الدوال في الخلفية، حتى الاستدعاء بدون باراميترات لن يكون مشكلاً لأن التضارب سيزول أصلاً.

---

## خطة اختبار (ضرورية قبل الإغلاق)
1) تسجيل الدخول وفتح أي صفحة فيها Sidebar:
   - التأكد أن **بادج “متابعة الديون” يظهر** ويعكس عدد العملاء المدينين.
2) فتح `/debt-tracking`:
   - التأكد أن الصفحة تحمل بدون أخطاء وأن البيانات تظهر.
3) البحث عن “جهاد ابو خلف”:
   - التأكد أنه **لا يظهر** كمدين إذا كانت باقته مسددة فعلاً.
4) التحقق من عميل لديه باقة غير مكتملة:
   - التأكد أن مجموع “المتبقي” يظهر صحيح وأن التفاصيل داخل الباقة منطقية.
5) اختبار تحديث البادج:
   - بعد أي عملية دفع، التأكد أن البادج يتغير بعد refresh/30 ثانية أو عند إعادة التركيز للنافذة.

---

## ملاحظات/مخاطر متوقعة
- لأن الدوال كانت مكررة بتواقيع مختلفة، قد تظهر أخطاء “غير مفهومة” في أماكن مختلفة. تنظيف الدوال سيمنع ذلك نهائياً.
- أي تغيير في دوال التقارير يجب أن يبقى سريعاً (CTEs محسوبة بشكل صحيح + استغلال group_id) لتجنب بطء مع 1000+ عميل.

---

## نطاق العمل (ملفات/أماكن سيتم لمسها)
- Frontend:
  - `src/hooks/useDebtCount.tsx`
- Backend:
  - Migration جديدة داخل `supabase/migrations/*` لإعادة توحيد:
    - `public.report_client_debts`
    - `public.report_client_debts_summary`
    - `public.report_debt_policies_for_clients`
    - وحذف النسخ المتضاربة

