

# تحسين بطاقات النشاط الأخير - اسم العميل قابل للنقر

## المشاكل
1. **اسم العميل غير قابل للنقر** - لا يمكن الانتقال لصفحة العميل مباشرة
2. **نص "12 دفعات" غير ضروري** - المستخدم لا يريد رؤية عدد الدفعات

## التغييرات المطلوبة

### الملف: `src/components/dashboard/RecentActivity.tsx`

#### 1. إضافة استيراد `useNavigate`

```tsx
import { useNavigate } from "react-router-dom";
```

#### 2. تمرير `navigate` للـ Component

```tsx
// داخل RecentActivity component
const navigate = useNavigate();

// تمرير للـ GroupedActivityCard
<GroupedActivityCard 
  key={group.clientId || group.clientName} 
  group={group} 
  compact 
  onClientClick={() => navigate(`/clients?open=${group.clientId}`)}
/>
```

#### 3. تحديث `GroupedActivityCard` Component

**قبل (سطر 704-706):**
```tsx
<span className="font-semibold text-foreground truncate">
  {group.clientName}
</span>
```

**بعد:**
```tsx
<button
  onClick={onClientClick}
  className="font-semibold text-foreground truncate hover:text-primary hover:underline transition-colors"
>
  {group.clientName}
</button>
```

#### 4. إزالة نص "X دفعات" (سطر 728-730)

**قبل:**
```tsx
<span className="text-sm font-medium">
  {group.payments.count} {group.payments.count === 1 ? "دفعة" : "دفعات"}
</span>
```

**بعد:**
```tsx
{/* Removed payment count as per user request */}
```

أو إذا أردنا عرض معلومة مفيدة بديلة:
```tsx
<span className="text-sm font-medium text-muted-foreground">الدفعات</span>
```

---

## ملخص التغييرات

| السطر | التغيير |
|-------|---------|
| أعلى الملف | إضافة `import { useNavigate }` |
| 421 | إنشاء `const navigate = useNavigate()` |
| 585 | إضافة prop `onClientClick` |
| 669 | إضافة prop `onClientClick` |
| 681 | تحديث signature: `onClientClick?: () => void` |
| 704-706 | تحويل `span` لـ `button` قابل للنقر |
| 728-730 | إزالة نص "X دفعات" |

---

## النتيجة المتوقعة

### قبل:
```
[أيقونة] Kareem Test [F1019]          منذ أقل من دقيقة
         12 دفعات                     ₪5,398
```

### بعد:
```
[أيقونة] Kareem Test [F1019]          منذ أقل من دقيقة
                                      ₪5,398
```

- **اسم العميل** يتحول للون الـ primary عند hover + underline
- **الضغط على الاسم** ينقل مباشرة لصفحة `/clients?open=[client_id]`
- **عدد الدفعات** تمت إزالته

