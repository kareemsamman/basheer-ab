
# خطة: عرض صافي المتبقي بعد خصم المرتجعات

## المشكلة الحالية
- كارت "إجمالي المتبقي" يظهر ₪300 (ما يدين به العميل)
- المرتجع اليدوي ₪300 لا يُخصم من هذا الرقم
- المستخدم يريد أن يرى أن 300 - 300 = 0

## السبب التقني
1. دالة `fetchWalletBalance` لا تشمل `manual_refund` في الحساب
2. كارت "إجمالي المتبقي" لا يأخذ بعين الاعتبار رصيد المحفظة (المرتجعات)

---

## التعديلات المطلوبة

### 1) تحديث دالة fetchWalletBalance (سطر 417-419)
إضافة `manual_refund` لقائمة أنواع المرتجعات:

```typescript
const weOweCustomer = (data || [])
  .filter(t => 
    t.transaction_type === 'refund' || 
    t.transaction_type === 'transfer_refund_owed' ||
    t.transaction_type === 'manual_refund'  // ← إضافة
  )
  .reduce((sum, t) => sum + (t.amount || 0), 0);
```

### 2) تحديث كارت "إجمالي المتبقي" (سطور 1073-1088)
تعديل العرض ليظهر:
- صافي المتبقي = الدين - المرتجعات
- توضيح تفصيلي في حال وجود مرتجعات

**الكود الجديد:**
```tsx
<Card className="p-4 flex items-center gap-4">
  <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
    <AlertCircle className="h-6 w-6 text-destructive" />
  </div>
  <div className="flex-1">
    <p className="text-xs text-muted-foreground">إجمالي المتبقي</p>
    {/* صافي المتبقي = الدين - المرتجعات */}
    <p className={cn("text-xl font-bold", 
      (paymentSummary.total_remaining - walletBalance.total_refunds) > 0 
        ? "text-destructive" 
        : "text-success"
    )}>
      ₪{Math.max(0, paymentSummary.total_remaining - walletBalance.total_refunds).toLocaleString()}
    </p>
    {/* عرض تفصيلي في حال وجود مرتجعات */}
    {walletBalance.total_refunds > 0 && (
      <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
        <p>المطلوب: ₪{paymentSummary.total_remaining.toLocaleString()}</p>
        <p className="text-amber-600">المرتجع: -₪{walletBalance.total_refunds.toLocaleString()}</p>
      </div>
    )}
  </div>
  <DebtIndicator
    totalOwed={paymentSummary.total_paid + paymentSummary.total_remaining} 
    totalPaid={paymentSummary.total_paid + walletBalance.total_refunds}  // احتساب المرتجعات كمدفوع
    showAmount={false}
  />
</Card>
```

### 3) تحديث شرط زر "دفع" (سطر 1000)
تغيير الشرط ليظهر الزر فقط إذا كان الصافي > 0:

```typescript
{(paymentSummary.total_remaining - walletBalance.total_refunds) > 0 && (
  <Button ...>دفع</Button>
)}
```

### 4) إزالة كارت "مرتجع للعميل" المنفصل (سطور 1103-1115)
بما أن المرتجع أصبح مُدمجاً في كارت "إجمالي المتبقي"، يمكن إزالة الكارت المنفصل أو تحويله ليظهر فقط عندما يكون الصافي سالباً (نحن مدينون للعميل).

---

## النتيجة المتوقعة

**قبل:**
```
إجمالي المتبقي: ₪300
[كارت منفصل] مرتجع للعميل: ₪300
```

**بعد (عندما الدين = المرتجع):**
```
إجمالي المتبقي: ₪0
  المطلوب: ₪300
  المرتجع: -₪300
```

**بعد (عندما الدين > المرتجع):**
```
إجمالي المتبقي: ₪200
  المطلوب: ₪500
  المرتجع: -₪300
```

**بعد (عندما المرتجع > الدين - نحن مدينون):**
```
إجمالي المتبقي: ₪0
[كارت منفصل] مرتجع للعميل: ₪100
```

---

## الملف المطلوب تعديله

| الملف | التعديلات |
|-------|-----------|
| `src/components/clients/ClientDetails.tsx` | 1) fetchWalletBalance: إضافة manual_refund<br>2) كارت المتبقي: عرض الصافي مع التفصيل<br>3) زر دفع: تحديث الشرط<br>4) كارت المرتجع: إظهار فقط إذا الصافي سالب |
