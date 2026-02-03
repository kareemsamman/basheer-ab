

# خطة: إصلاح مشكلة عدم تطابق إجمالي المتبقي بين صفحة العميل ومتابعة الديون

## ملخص المشكلة

العميل **اشرف زياد ناصر** يظهر:
- صفحة ملف العميل: **₪15,200** (صحيح ✅)
- صفحة/مودال متابعة الديون: **₪6,138** (خطأ ❌)

## تحليل البيانات

بعد فحص قاعدة البيانات:
- العميل لديه **4 باقات تأمين** مع ديون متبقية
- إجمالي المتبقي الفعلي = **15,200₪**

| الباقة | السيارة | السعر الكلي | المدفوع | المتبقي |
|--------|---------|-------------|---------|---------|
| 5c3f8f8d | 16007301 | 6,524 | 1,724 | 4,800 |
| cc912f8a | 7012133 | 7,928 | 4,128 | 3,800 |
| 73538a02 | 8007131 | 5,333 | 2,033 | 3,300 |
| c1b342e3 | 49435601 | 4,805 | 1,505 | 3,300 |
| **الإجمالي** | | | | **15,200** |

---

## جذر المشكلة

### المشكلة 1: DebtTracking يستخدم حقل غير موجود

**الملف:** `src/pages/DebtTracking.tsx`

الكود الحالي (السطور 140-142):
```typescript
total_owed: Number(r.total_owed) || 0,
total_paid: Number(r.total_paid) || 0,      // ← لا يوجد في RPC!
total_remaining: Number(r.total_remaining) || 0,  // ← لا يوجد في RPC!
```

**المشكلة:** الـ RPC `report_client_debts` يُرجع `total_owed` فقط، لكن الكود يحاول قراءة `total_remaining` و `total_paid` اللذان لا يوجدان.

**النتيجة:** `client.total_remaining` يكون دائماً **0** أو قيمة خاطئة.

### المشكلة 2: عرض المجموع بدلاً من total_owed

في السطر 484:
```typescript
{formatCurrency(client.total_remaining)}  // ← يجب أن يكون total_owed
```

---

## الحل المقترح

### الإصلاح 1: توحيد الحقول في DebtTracking

**التغيير في السطور 140-142:**
```typescript
// قبل:
total_owed: Number(r.total_owed) || 0,
total_paid: Number(r.total_paid) || 0,
total_remaining: Number(r.total_remaining) || 0,

// بعد:
total_owed: Number(r.total_owed) || 0,
total_paid: 0,  // لا يأتي من هذا RPC - سيُحسب لاحقاً إذا لزم
total_remaining: Number(r.total_owed) || 0,  // استخدم total_owed كـ remaining
```

### الإصلاح 2: تحديث العرض ليستخدم الحقل الصحيح

**التغيير في السطر 484:**
```typescript
// قبل:
{formatCurrency(client.total_remaining)}

// بعد (للوضوح، استخدم total_owed أو المحسوب):
{formatCurrency(client.total_owed)}
```

### الإصلاح 3: تحديث WhatsApp message (السطر 276)

```typescript
// قبل:
const message = `...${client.total_remaining.toLocaleString()}...`;

// بعد:
const message = `...${client.total_owed.toLocaleString()}...`;
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/pages/DebtTracking.tsx` | تصحيح mapping الحقول واستخدام `total_owed` بدلاً من `total_remaining` |

---

## النتيجة المتوقعة

1. ✅ صفحة متابعة الديون ستعرض **15,200₪** بدلاً من **0** أو قيمة خاطئة
2. ✅ رسائل WhatsApp ستحتوي المبلغ الصحيح
3. ✅ مودال الدفع سيتلقى المبلغ الصحيح كـ prop

---

## ملاحظة

مصدر الرقم **6,138** في الصورة غير واضح تماماً من البيانات. قد يكون:
- من cache قديم في المتصفح
- من فلتر سيارات معين في المودال
- من نسخة سابقة من الكود

الإصلاح المقترح سيضمن عرض القيمة الصحيحة من قاعدة البيانات.

