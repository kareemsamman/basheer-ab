
# خطة: إصلاح عرض مبلغ الدين الخاطئ

## المشكلة
الواجهة تعرض `total_owed` (إجمالي أسعار الوثائق = ₪6,300) بدلاً من `total_remaining` (المتبقي الفعلي = ₪1,600).

**البيانات من قاعدة البيانات:**
```
total_owed: 6300       ← مجموع أسعار الوثائق المدينة
total_paid: 4700       ← المدفوع  
total_remaining: 1600  ← المتبقي الفعلي ← يجب عرض هذا!
```

---

## الحل التقني

### 1. تحديث الـ Interface
**الملف:** `src/pages/DebtTracking.tsx` (السطور 26-35)

```typescript
interface ClientDebt {
  client_id: string;
  client_name: string;
  phone_number: string | null;
  total_owed: number;      // إجمالي السعر
  total_paid: number;      // إضافة: المدفوع
  total_remaining: number; // إضافة: المتبقي الفعلي
  policies: PolicyDebt[];
  policies_count: number;
  earliest_expiry: string | null;
  days_until_expiry: number | null;
}
```

### 2. تحديث الـ Mapping
**السطور 134-143:**

```typescript
const baseClients: ClientDebt[] = (clientRows || []).map((r: any) => ({
  client_id: r.client_id,
  client_name: r.client_name,
  phone_number: r.client_phone,
  total_owed: Number(r.total_owed) || 0,
  total_paid: Number(r.total_paid) || 0,       // إضافة
  total_remaining: Number(r.total_remaining) || 0,  // إضافة
  policies: [],
  policies_count: Number(r.policies_count) || 0,
  earliest_expiry: r.oldest_end_date ? String(r.oldest_end_date) : null,
  days_until_expiry: r.days_until_oldest == null || isNaN(Number(r.days_until_oldest)) ? null : Number(r.days_until_oldest),
}));
```

### 3. تغيير العرض
**السطور 478-482:**

من:
```typescript
<p className="font-bold text-lg text-destructive">
  {formatCurrency(client.total_owed)}
</p>
```

إلى:
```typescript
<p className="font-bold text-lg text-destructive">
  {formatCurrency(client.total_remaining)}
</p>
```

### 4. تحديث رسالة WhatsApp
**السطر 272:**

من:
```typescript
const message = `... ${client.total_owed.toLocaleString()} شيكل...`;
```

إلى:
```typescript
const message = `... ${client.total_remaining.toLocaleString()} شيكل...`;
```

---

## ملخص الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/pages/DebtTracking.tsx` | إصلاح الـ interface + mapping + عرض المبلغ |

---

## النتيجة المتوقعة

**قبل:** العميل "سند شواورة" يظهر ₪6,300  
**بعد:** العميل "سند شواورة" يظهر ₪1,600 ✓

المبلغ المعروض الآن يطابق مجموع الأعمدة "المتبقي" في الجدول.
