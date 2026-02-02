
# خطة: تحسينات صفحة تقارير التجديدات و PDF

## المتطلبات

1. **عرض أرقام السيارات في كل صف** - بدون الحاجة لفتح القائمة المنسدلة
2. **البحث برقم السيارة** - إضافة للبحث الحالي
3. **إصلاح تقرير PDF**:
   - عرض العملاء بشكل مجمّع (77 عميل) وليس الوثائق (161)
   - تغيير "إجمالي الوثائق" إلى "إجمالي بحاجة للتجديد"
   - عرض وثائق كل عميل تحته
   - تحسين التصميم والتفاصيل
   - استخدام التقويم الميلادي بدل الهجري

---

## التغييرات التقنية

### 1. تحديث RPC `report_renewals` لإضافة `car_numbers`

**ملف SQL جديد:**

```sql
-- إضافة car_numbers للـ report_renewals الذي يُجمّع حسب العميل
CREATE OR REPLACE FUNCTION public.report_renewals(
  ...
)
RETURNS TABLE(
  client_id uuid, 
  client_name text, 
  ...
  policy_ids uuid[], 
  car_numbers text[],  -- ← جديد
  worst_renewal_status text, 
  ...
)
```

**في قسم client_policies:**
```sql
-- إضافة car_number لكل وثيقة
LEFT JOIN cars car ON car.id = p.car_id
...
car.car_number as car_num
```

**في قسم aggregated:**
```sql
-- تجميع أرقام السيارات
ARRAY_AGG(DISTINCT cp.car_num) FILTER (WHERE cp.car_num IS NOT NULL) as car_numbers,
```

**تحديث البحث ليشمل car_number:**
```sql
AND (
  p_search IS NULL
  OR c.full_name ILIKE '%' || p_search || '%'
  OR c.phone_number ILIKE '%' || p_search || '%'
  OR c.file_number ILIKE '%' || p_search || '%'
  OR c.id_number ILIKE '%' || p_search || '%'
  OR car.car_number ILIKE '%' || p_search || '%'  -- ← جديد
)
```

---

### 2. تحديث `report_renewals_service` للـ PDF (تجميع حسب العميل)

**تغيير بنية الإرجاع بالكامل:**

حالياً ترجع وثائق منفردة → يجب أن ترجع عملاء مع وثائقهم

```sql
CREATE OR REPLACE FUNCTION public.report_renewals_service(...)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count integer,
  earliest_end_date date,
  days_remaining integer,
  total_price numeric,
  car_numbers text[],
  policy_types text[],
  renewal_status text,
  renewal_notes text
)
```

---

### 3. تحديث Frontend `src/pages/PolicyReports.tsx`

#### 3.1 تحديث Interface RenewalClient

```typescript
interface RenewalClient {
  client_id: string;
  client_name: string;
  ...
  policy_ids: string[] | null;
  car_numbers: string[] | null;  // ← جديد
  worst_renewal_status: string;
  ...
}
```

#### 3.2 إضافة عمود "السيارات" في الجدول

**في TableHeader (بعد "الوثائق"):**
```tsx
<TableHead className="text-right">السيارات</TableHead>
```

**في TableBody:**
```tsx
<TableCell>
  <div className="flex flex-wrap gap-1">
    {client.car_numbers?.slice(0, 3).map((num, i) => (
      <span key={i} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
        {num}
      </span>
    ))}
    {(client.car_numbers?.length || 0) > 3 && (
      <span className="text-xs text-muted-foreground">+{client.car_numbers!.length - 3}</span>
    )}
  </div>
</TableCell>
```

#### 3.3 تحديث colSpan للصف الموسّع

```tsx
// من 11 إلى 12
<TableCell colSpan={12} className="p-0">
```

---

### 4. إعادة بناء تقرير PDF (Edge Function)

**ملف:** `supabase/functions/generate-renewals-report/index.ts`

#### 4.1 تجميع البيانات حسب العميل

```typescript
// بعد جلب البيانات من RPC الجديد
// البيانات الآن تأتي مجمّعة حسب العميل

const clients = renewals; // كل صف = عميل واحد
const totalCustomers = clients.length;
const totalPolicies = clients.reduce((sum, c) => sum + c.policies_count, 0);
```

#### 4.2 تحديث ملخص التقرير

```html
<div class="summary-card">
  <div class="value">${clients.length}</div>
  <div class="label">إجمالي بحاجة للتجديد</div>  <!-- ← تغيير النص -->
</div>
<div class="summary-card">
  <div class="value">${totalPolicies}</div>
  <div class="label">إجمالي الوثائق</div>
</div>
```

#### 4.3 تحديث هيكل الجدول (عميل مع وثائقه)

```html
<!-- عرض العميل كـ header -->
<tr class="client-row">
  <td colspan="2">{client_name} <small>#{file_number}</small></td>
  <td>{phone}</td>
  <td>{policies_count} وثيقة</td>
  <td class="cars">{car_numbers.join(', ')}</td>
  <td>{earliest_end_date}</td>
  <td>{days_remaining} يوم</td>
  <td>₪{total_price}</td>
  <td>{renewal_status}</td>
</tr>
```

#### 4.4 إصلاح التاريخ (ميلادي بدل هجري)

```typescript
// قبل:
const now = new Date().toLocaleDateString('ar-SA', { ... });

// بعد:
const now = new Date().toLocaleDateString('ar-EG', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  hour: '2-digit', 
  minute: '2-digit'
});
// النتيجة: "٢ فبراير ٢٠٢٦، ١٤:٢٦"
```

```typescript
// أيضاً اسم الشهر:
const monthName = new Date(`${month}-01`).toLocaleDateString('ar-EG', { 
  year: 'numeric', 
  month: 'long' 
});
// النتيجة: "فبراير ٢٠٢٦"
```

#### 4.5 تحسين تصميم HTML

```css
/* تصميم صف العميل */
.client-row {
  background: linear-gradient(to right, #f8fafc, white);
  border-right: 4px solid #0f766e;
  font-weight: 600;
}

.client-row.urgent {
  border-right-color: #dc2626;
  background: linear-gradient(to right, #fef2f2, white);
}

/* تصميم أرقام السيارات */
.cars {
  font-family: monospace;
  direction: ltr;
  text-align: left;
}

/* تصميم الإحصائيات */
.summary-card {
  min-width: 120px;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.summary-card .value {
  font-size: 32px;
  font-weight: bold;
  color: #0f766e;
}

.summary-card.urgent .value {
  color: #dc2626;
}
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| **Database Migration (جديد)** | تحديث `report_renewals` و `report_renewals_service` لإضافة `car_numbers` والبحث والتجميع |
| `src/pages/PolicyReports.tsx` | إضافة عمود السيارات + تحديث interface |
| `supabase/functions/generate-renewals-report/index.ts` | تجميع حسب العميل + تحسين التصميم + تاريخ ميلادي |

---

## SQL Migration الكامل

```sql
-- 1. Update report_renewals to include car_numbers and search by car_number
CREATE OR REPLACE FUNCTION public.report_renewals(
  p_start_date date DEFAULT NULL::date, 
  p_end_date date DEFAULT NULL::date, 
  p_policy_type text DEFAULT NULL::text, 
  p_created_by uuid DEFAULT NULL::uuid, 
  p_search text DEFAULT NULL::text, 
  p_page_size integer DEFAULT 25, 
  p_page integer DEFAULT 1
)
RETURNS TABLE(
  client_id uuid, 
  client_name text, 
  client_file_number text, 
  client_phone text, 
  policies_count integer, 
  earliest_end_date date, 
  days_remaining integer, 
  total_insurance_price numeric, 
  policy_types text[], 
  policy_ids uuid[], 
  car_numbers text[],
  worst_renewal_status text, 
  renewal_notes text, 
  total_count bigint
)
-- ... باقي الدالة مع إضافة JOIN cars والبحث برقم السيارة

-- 2. Update report_renewals_service for PDF (grouped by client)
CREATE OR REPLACE FUNCTION public.report_renewals_service(
  p_end_month date DEFAULT NULL::date, 
  p_days_remaining integer DEFAULT NULL::integer, 
  p_policy_type text DEFAULT NULL::text, 
  p_limit integer DEFAULT 1000, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  client_id uuid,
  client_name text,
  client_file_number text,
  client_phone text,
  policies_count integer,
  earliest_end_date date,
  days_remaining integer,
  total_price numeric,
  car_numbers text[],
  policy_types text[],
  renewal_status text,
  renewal_notes text,
  total_rows bigint
)
-- ... دالة تُجمّع حسب العميل
```

---

## النتيجة المتوقعة

### في صفحة التقارير:

| العميل | الهاتف | الوثائق | السيارات | الأنواع | أقرب انتهاء | الأيام | السعر | الحالة |
|--------|--------|---------|----------|---------|-------------|--------|-------|--------|
| إبراهيم تايه | 0525544807 | 3 وثيقة | `7336131`, `88149079` | إلزامي، ثالث/شامل | 31/01/2026 | -2 يوم | ₪6,466 | تم إرسال SMS |
| أخلاص بكيرات | 0543307553 | 1 وثيقة | `12345678` | إلزامي | 31/01/2026 | -2 يوم | ₪1,659 | تم إرسال SMS |

### في تقرير PDF:

```
┌─────────────────────────────────────────────────────────────────┐
│                    تقرير الوثائق المنتهية                       │
│                      فبراير 2026                                │
├─────────────────────────────────────────────────────────────────┤
│   إجمالي بحاجة للتجديد    │    لم يتم التواصل    │   تم إرسال SMS  │
│          77 عميل         │         56           │       21        │
├─────────────────────────────────────────────────────────────────┤
│ # │ العميل            │ الهاتف     │ السيارات       │ الوثائق │ الانتهاء │
├───┼──────────────────┼───────────┼───────────────┼────────┼──────────┤
│ 1 │ إبراهيم تايه #845│ 0525544807│ 7336131, 8814 │ 3      │ 31/01    │
│ 2 │ أخلاص بكيرات #111│ 0543307553│ 12345678      │ 1      │ 31/01    │
└─────────────────────────────────────────────────────────────────┘

تم إنشاء التقرير: ٢ فبراير ٢٠٢٦، ١٤:٢٦
```

---

## اختبار بعد التنفيذ

1. اذهب لصفحة `/reports/policies` → تبويب "التجديدات"
2. تأكد أن عمود **"السيارات"** يظهر مع أرقام السيارات
3. ابحث برقم سيارة (مثلاً `7336131`) → يجب أن يظهر العميل
4. اضغط **"تصدير PDF"**:
   - تأكد أن العنوان "إجمالي بحاجة للتجديد: 77"
   - تأكد أن التاريخ بالميلادي (فبراير 2026)
   - تأكد أن كل عميل يظهر مرة واحدة مع عدد وثائقه
5. تأكد أن البحث يعمل برقم السيارة
