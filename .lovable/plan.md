
# خطة إضافة أداة إصلاح دفعات الإلزامي

## المشكلة
هناك **320 وثيقة إلزامي** في قاعدة البيانات بدون أي دفعات. حسب منطق النظام، وثائق الإلزامي تُدفع مباشرة للشركة، لذا يجب أن يكون لكل وثيقة إلزامي دفعة تلقائية بكامل المبلغ.

## الحل
إضافة أداة جديدة في صفحة **WordPress Import** (تبويب الأدوات) تقوم بـ:

1. **البحث** عن جميع وثائق الإلزامي بدون دفعات
2. **إنشاء** دفعة تلقائية لكل وثيقة بمبلغ = `insurance_price`
3. **عرض** تقرير مفصل عن العمليات المنجزة

## التغييرات المطلوبة

### الملف: `src/pages/WordPressImport.tsx`

**إضافة متغيرات State جديدة** (بعد السطر 115):
```typescript
// Fix ELZAMI payments state
const [fixingElzami, setFixingElzami] = useState(false);
const [elzamiFixStats, setElzamiFixStats] = useState<{
  found: number;
  fixed: number;
  errors: string[];
} | null>(null);
const [elzamiUnpaidCount, setElzamiUnpaidCount] = useState<number | null>(null);
```

**إضافة دالة جلب العدد** (للعرض في الواجهة):
```typescript
const fetchUnpaidElzamiCount = async () => {
  const { count, error } = await supabase
    .from('policies')
    .select('id', { count: 'exact', head: true })
    .eq('policy_type_parent', 'ELZAMI')
    .not('id', 'in', 
      supabase.from('policy_payments')
        .select('policy_id')
        .eq('refused', false)
    );
  
  if (!error) setElzamiUnpaidCount(count || 0);
};
```

**إضافة دالة الإصلاح الرئيسية**:
```typescript
const handleFixElzamiPayments = async () => {
  setFixingElzami(true);
  setElzamiFixStats(null);
  
  const stats = { found: 0, fixed: 0, errors: [] as string[] };
  
  try {
    // 1. Fetch all ELZAMI policies without payments
    const { data: unpaidElzami, error } = await supabase
      .from('policies')
      .select('id, policy_number, insurance_price, start_date')
      .eq('policy_type_parent', 'ELZAMI');
    
    if (error) throw error;
    
    // 2. Filter to only those without payments
    const policyIds = unpaidElzami?.map(p => p.id) || [];
    const { data: existingPayments } = await supabase
      .from('policy_payments')
      .select('policy_id')
      .in('policy_id', policyIds)
      .eq('refused', false);
    
    const paidPolicyIds = new Set(existingPayments?.map(p => p.policy_id) || []);
    const needsPayment = unpaidElzami?.filter(p => !paidPolicyIds.has(p.id)) || [];
    
    stats.found = needsPayment.length;
    
    // 3. Create payments in batches
    const batchSize = 50;
    for (let i = 0; i < needsPayment.length; i += batchSize) {
      const batch = needsPayment.slice(i, i + batchSize);
      const payments = batch.map(policy => ({
        policy_id: policy.id,
        payment_type: 'cash',
        amount: policy.insurance_price,
        date: policy.start_date || new Date().toISOString().split('T')[0],
        refused: false,
        source: 'system',
        locked: true,
        notes: 'دفعة إلزامي تلقائية - إصلاح بيانات',
      }));
      
      const { error: insertError } = await supabase
        .from('policy_payments')
        .insert(payments);
      
      if (insertError) {
        stats.errors.push(`دفعة ${i}-${i+batchSize}: ${insertError.message}`);
      } else {
        stats.fixed += batch.length;
      }
    }
    
    toast({
      title: "تم الإصلاح",
      description: `تم إضافة ${stats.fixed} دفعة من أصل ${stats.found}`,
    });
    
    // Refresh count
    fetchUnpaidElzamiCount();
    
  } catch (e: any) {
    stats.errors.push(e.message);
    toast({
      title: "خطأ",
      description: e.message,
      variant: "destructive",
    });
  } finally {
    setElzamiFixStats(stats);
    setFixingElzami(false);
  }
};
```

**إضافة useEffect لجلب العدد عند التحميل**:
```typescript
useEffect(() => {
  fetchUnpaidElzamiCount();
}, []);
```

**إضافة واجهة الأداة في تبويب "tools"** (بعد بطاقة ربط الوثائق بشركة التأمين):

```tsx
{/* Fix ELZAMI Payments Tool */}
<Card className="border-2 border-amber-500">
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-amber-600">
      <AlertTriangle className="h-5 w-5" />
      إصلاح دفعات الإلزامي
    </CardTitle>
    <CardDescription>
      يقوم بإضافة دفعة تلقائية لكل وثيقة إلزامي بدون دفعات.
      <br />
      الإلزامي يُدفع مباشرة للشركة، لذا يجب أن تكون كل وثيقة "مدفوعة".
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Show count of unpaid ELZAMI */}
    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm">وثائق إلزامي بدون دفعات:</span>
        <Badge variant={elzamiUnpaidCount && elzamiUnpaidCount > 0 ? "destructive" : "secondary"}>
          {elzamiUnpaidCount !== null ? elzamiUnpaidCount : '...'}
        </Badge>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <Button 
        onClick={handleFixElzamiPayments} 
        disabled={fixingElzami || elzamiUnpaidCount === 0}
        className="bg-amber-600 hover:bg-amber-700"
      >
        {fixingElzami ? (
          <><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري الإصلاح...</>
        ) : (
          <><Play className="h-4 w-4 ml-2" />إصلاح الدفعات</>
        )}
      </Button>
      
      <Button 
        variant="outline" 
        onClick={fetchUnpaidElzamiCount}
        disabled={fixingElzami}
      >
        <RefreshCw className="h-4 w-4 ml-2" />
        تحديث العدد
      </Button>
    </div>

    {/* Results */}
    {elzamiFixStats && (
      <div className="p-4 border rounded-lg space-y-2 bg-muted">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-sm text-muted-foreground">وثائق بحاجة إصلاح</p>
            <p className="text-2xl font-bold">{elzamiFixStats.found}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">تم إصلاحها</p>
            <p className="text-2xl font-bold text-green-600">{elzamiFixStats.fixed}</p>
          </div>
        </div>
        {elzamiFixStats.errors.length > 0 && (
          <div className="text-sm text-destructive">
            <p className="font-medium">أخطاء ({elzamiFixStats.errors.length}):</p>
            <ScrollArea className="h-24 mt-1">
              {elzamiFixStats.errors.map((err, i) => (
                <p key={i} className="text-xs">{err}</p>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>
    )}
  </CardContent>
</Card>
```

---

## ملخص

| العنصر | التفاصيل |
|--------|----------|
| **الملف** | `src/pages/WordPressImport.tsx` |
| **الموقع** | تبويب "الأدوات" (tools) |
| **الوظيفة** | إضافة دفعة تلقائية لكل وثيقة إلزامي بدون دفعات |
| **العدد الحالي** | 320 وثيقة تحتاج إصلاح |

## النتائج المتوقعة

1. ✅ عرض عدد وثائق الإلزامي بدون دفعات
2. ✅ زر لبدء الإصلاح
3. ✅ إنشاء دفعة بـ `source: 'system'` و `locked: true`
4. ✅ عرض تقرير مفصل بعد الانتهاء
5. ✅ تحديث العدد تلقائياً بعد الإصلاح
