
# خطة: تصفية تلقائية بالسيارة عند البحث برقم السيارة

## المشكلة
عند البحث في شريط البحث السفلي (BottomToolbarInlineSearch) برقم سيارة والضغط على النتيجة، يتم فتح ملف العميل ولكن لا يتم تحديد السيارة المُبحث عنها في فلتر السيارات.

## الحل المطلوب
عند البحث برقم سيارة والنقر على النتيجة:
1. فتح ملف العميل
2. تحديد السيارة المطابقة تلقائياً في CarFilterChips

---

## التدفق الجديد

```text
┌────────────────────────────────────────────────────────┐
│ المستخدم يبحث: "21212121"                              │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│ البحث يجد السيارة ويعرض صاحبها (العميل)               │
│ يتم تخزين car_id الذي طابق البحث                       │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│ المستخدم ينقر على النتيجة                              │
│ التنقل: /clients?open=CLIENT_ID&car=CAR_ID             │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│ صفحة Clients.tsx تقرأ الـ parameters                   │
│ تمرر initialCarFilter إلى ClientDetails              │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│ ClientDetails يُهيئ policyCarFilter بقيمة الـ car      │
│ السيارة المطلوبة تظهر مُحددة في CarFilterChips ✓      │
└────────────────────────────────────────────────────────┘
```

---

## التغييرات التقنية

### 1. `BottomToolbarInlineSearch.tsx`
**تتبع السيارة المطابقة للبحث**

```typescript
interface ClientResult {
  id: string;
  full_name: string;
  id_number: string;
  phone_number: string | null;
  cars: string[];
  matchedCarId?: string;  // إضافة: معرف السيارة التي طابقت البحث
}
```

**تخزين معرف السيارة المطابقة:**
```typescript
// عند إضافة عميل من نتائج البحث عن السيارات
for (const row of carsRes.data || []) {
  const client = row.clients;
  const entry = map.get(client.id);
  
  // إذا كانت السيارة تطابق البحث، نخزن معرفها
  if (row.car_number.includes(searchTerm)) {
    if (entry) {
      entry.matchedCarId = row.id;  // معرف السيارة
    }
  }
}
```

**تمرير معرف السيارة في الـ URL:**
```typescript
const handleSelect = (clientId: string, matchedCarId?: string) => {
  clearSearch();
  const url = matchedCarId 
    ? `/clients?open=${clientId}&car=${matchedCarId}`
    : `/clients?open=${clientId}`;
  window.location.href = url;
};
```

### 2. `GlobalPolicySearch.tsx`
**نفس التغييرات:**

```typescript
interface ClientSearchResult {
  // ... الحقول الموجودة
  matchedCarId?: string;  // إضافة
}

// عند البحث بالسيارات - حفظ المعرف
for (const car of carsData || []) {
  if (car.car_number.toLowerCase().includes(searchTerm.toLowerCase())) {
    // حفظ car.id كـ matchedCarId
  }
}

// عند التنقل
const handleSelectClient = (clientId: string, matchedCarId?: string) => {
  onOpenChange(false);
  const url = matchedCarId 
    ? `/clients?open=${clientId}&car=${matchedCarId}`
    : `/clients?open=${clientId}`;
  window.location.href = url;
};
```

### 3. `Clients.tsx`
**قراءة معرف السيارة من URL:**

```typescript
// عند فتح العميل من URL
useEffect(() => {
  const openClientId = searchParams.get('open');
  const carId = searchParams.get('car');  // إضافة
  
  if (openClientId && !viewingClient) {
    supabase
      .from('clients')
      .select('...')
      .eq('id', openClientId)
      .single()
      .then(({ data }) => {
        if (data) {
          setViewingClient(data);
          setInitialCarFilter(carId || null);  // إضافة state جديد
          setSearchParams({});
        }
      });
  }
}, [searchParams]);

// تمرير للـ ClientDetails
<ClientDetails
  client={viewingClient}
  initialCarFilter={initialCarFilter}  // إضافة prop
  onBack={() => {
    setViewingClient(null);
    setInitialCarFilter(null);
  }}
  ...
/>
```

### 4. `ClientDetails.tsx`
**استقبال وتطبيق الفلتر الأولي:**

```typescript
interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onRefresh: () => void;
  initialCarFilter?: string | null;  // إضافة prop اختياري
}

export function ClientDetails({ client, onBack, onRefresh, initialCarFilter }: ClientDetailsProps) {
  // تهيئة الفلتر بالقيمة الأولية إذا وُجدت
  const [policyCarFilter, setPolicyCarFilter] = useState<string>(initialCarFilter || 'all');

  // تحديث الفلتر إذا تغير initialCarFilter
  useEffect(() => {
    if (initialCarFilter) {
      setPolicyCarFilter(initialCarFilter);
    }
  }, [initialCarFilter]);
  
  // ... باقي الكود
}
```

---

## ملخص الملفات المطلوب تعديلها

| الملف | التغيير |
|-------|---------|
| `BottomToolbarInlineSearch.tsx` | إضافة `matchedCarId` وتمريره في URL |
| `GlobalPolicySearch.tsx` | إضافة `matchedCarId` وتمريره في URL |
| `Clients.tsx` | قراءة `car` param وإضافة `initialCarFilter` state |
| `ClientDetails.tsx` | استقبال `initialCarFilter` prop وتهيئة `policyCarFilter` |

---

## النتيجة المتوقعة

1. البحث برقم سيارة "21212121" يُظهر العميل صاحب السيارة
2. النقر على النتيجة يفتح ملف العميل مع تحديد السيارة "21212121" تلقائياً
3. CarFilterChips يُظهر السيارة المطلوبة مُحددة (مع علامة ✓)
4. الوثائق المعروضة تُفلتر لتلك السيارة فقط
5. يمكن للمستخدم النقر على "الكل" للعودة لعرض جميع الوثائق
