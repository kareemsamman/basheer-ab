

# خطة: إصلاح حد 1000 سجل في تحليل الاستيراد التفاضلي

## المشكلة المحددة

الكود الحالي في `analyzeJsonForIncrementalImport` يستخدم استعلامات Supabase العادية التي ترجع **فقط 1000 سجل** كحد أقصى:

```typescript
// الكود الحالي - يرجع 1000 سجل فقط!
const [clientsRes, carsRes, policiesRes] = await Promise.all([
  supabase.from('clients').select('id_number').is('deleted_at', null),
  supabase.from('cars').select('car_number').is('deleted_at', null),
  supabase.from('policies').select('legacy_wp_id').not('legacy_wp_id', 'is', null),
]);
```

**الأرقام الفعلية في قاعدة البيانات:**
| الكيان | العدد الفعلي | ما يرجعه الاستعلام |
|--------|-------------|-------------------|
| العملاء | 1,069 | 1,000 |
| السيارات | 1,448 | 1,000 |
| الوثائق | 4,671 | 1,000 |

**النتيجة الخاطئة:**
- الـ 65 عميل "جديد" هم في الحقيقة موجودون لكن لم يتم جلبهم!
- الـ 3716 وثيقة "جديدة" = معظمها موجودة لكن لم يتم جلبها!

---

## الحل

استخدام **دالة مساعدة للـ pagination** تجلب كل السجلات:

```typescript
// دالة مساعدة لجلب كل السجلات
const fetchAllRecords = async <T>(
  tableName: string,
  selectFields: string,
  filters?: { column: string; op: 'is' | 'not'; value: any }[]
): Promise<T[]> => {
  const allRecords: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  
  while (true) {
    let query = supabase.from(tableName).select(selectFields);
    
    // Apply filters
    if (filters) {
      for (const filter of filters) {
        if (filter.op === 'is') {
          query = query.is(filter.column, filter.value);
        } else if (filter.op === 'not') {
          query = query.not(filter.column, 'is', filter.value);
        }
      }
    }
    
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allRecords.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  
  return allRecords;
};
```

---

## التغييرات في الملفات

| الملف | التغيير |
|-------|---------|
| `src/pages/WordPressImport.tsx` | تحديث `analyzeJsonForIncrementalImport` لاستخدام pagination |

---

## الكود المحدث

```typescript
const analyzeJsonForIncrementalImport = async (data: any) => {
  if (!data) return;
  
  setAnalyzingJson(true);
  setIncrementalAnalysis(null);
  
  try {
    // دالة مساعدة لجلب كل السجلات (تتجاوز حد 1000)
    const fetchAllRecords = async (
      tableName: string,
      selectField: string,
      filters: { column: string; op: 'is' | 'not'; value: any }[]
    ): Promise<string[]> => {
      const allRecords: string[] = [];
      const pageSize = 1000;
      let offset = 0;
      
      while (true) {
        let query = supabase.from(tableName).select(selectField);
        
        for (const filter of filters) {
          if (filter.op === 'is') {
            query = query.is(filter.column, filter.value);
          } else {
            query = query.not(filter.column, 'is', filter.value);
          }
        }
        
        const { data: batch, error } = await query.range(offset, offset + pageSize - 1);
        
        if (error) throw error;
        if (!batch || batch.length === 0) break;
        
        allRecords.push(...batch.map((r: any) => r[selectField]));
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      
      return allRecords;
    };
    
    // جلب كل البيانات الموجودة (بدون حد 1000)
    const [existingClientIds, existingCarNumbers, existingPolicyWpIds] = await Promise.all([
      fetchAllRecords('clients', 'id_number', [{ column: 'deleted_at', op: 'is', value: null }]),
      fetchAllRecords('cars', 'car_number', [{ column: 'deleted_at', op: 'is', value: null }]),
      fetchAllRecords('policies', 'legacy_wp_id', [{ column: 'legacy_wp_id', op: 'not', value: null }]),
    ]);
    
    const clientIdSet = new Set(existingClientIds.filter(Boolean));
    const carNumberSet = new Set(existingCarNumbers.filter(Boolean));
    const policyWpIdSet = new Set(existingPolicyWpIds.filter(Boolean));
    
    // الباقي كما هو...
  } catch (err: any) {
    // ...
  }
};
```

---

## النتيجة المتوقعة

بعد التعديل:

| الكيان | قبل الإصلاح | بعد الإصلاح |
|--------|-------------|-------------|
| العملاء الجدد | 65 ❌ | ~0-5 ✅ |
| الوثائق الجديدة | 3716 ❌ | الرقم الحقيقي ✅ |

---

## اختبار

1. اذهب لصفحة `/wordpress-import`
2. ارفع نفس الملف JSON
3. اضغط "تحليل الملف"
4. تأكد أن الأرقام منطقية:
   - العملاء الموجودين = ~1069
   - الوثائق الموجودة = ~4671

