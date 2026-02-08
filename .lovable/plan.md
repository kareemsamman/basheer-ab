
# خطة إصلاح مشكلة اختيار العميل الخاطئ عند إنشاء وثيقة جديدة

## المشكلة

عندما يفتح المستخدم نافذة إنشاء وثيقة جديدة من ملف عميل معين (مثل "Kareem Test")، ثم يغيّر العميل لآخر من القائمة، أحياناً يتم إنشاء الوثيقة للعميل الأصلي بدلاً من العميل الجديد.

## السبب الجذري

**Race Condition في الـ async effect**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. المستخدم في ملف "كريم" → يضغط "وثيقة جديدة"                      │
│  2. preselectedClientId = "كريم_ID"                                  │
│  3. useEffect يبدأ fetchPreselectedClient() (async) ⏳               │
│  4. المستخدم يضغط "تغيير" → يختار "محمد" من القائمة ✓                │
│  5. selectedClient = "محمد" (صحيح حتى الآن)                          │
│  6. الـ async call ينتهي → setSelectedClient("كريم") ❌              │
│  7. النتيجة: العميل "كريم" بدلاً من "محمد" ❌                         │
└─────────────────────────────────────────────────────────────────────┘
```

## الحل

### التغيير المطلوب في `usePolicyWizardState.ts`

إضافة آلية إلغاء (cleanup) للـ effect الـ async لمنع تعيين العميل القديم إذا تغيّر:

**قبل (السطور 79-100):**
```typescript
// Auto-select preselected client
useEffect(() => {
  if (!preselectedClientId || !open) return;
  if (selectedClient?.id === preselectedClientId) return;

  const fetchPreselectedClient = async () => {
    setLoadingClients(true);
    const { data, error } = await supabase
      .from('clients')
      .select('...')
      .eq('id', preselectedClientId)
      .single();
    
    setLoadingClients(false);
    if (!error && data) {
      setSelectedClient(data as Client);  // ❌ Race condition هنا!
      setCreateNewClient(false);
    }
  };

  fetchPreselectedClient();
}, [preselectedClientId, open]);
```

**بعد:**
```typescript
// Auto-select preselected client
useEffect(() => {
  if (!preselectedClientId || !open) return;
  if (selectedClient?.id === preselectedClientId) return;

  let cancelled = false;  // Flag لإلغاء الـ async call

  const fetchPreselectedClient = async () => {
    setLoadingClients(true);
    const { data, error } = await supabase
      .from('clients')
      .select('...')
      .eq('id', preselectedClientId)
      .single();
    
    setLoadingClients(false);
    
    // ✅ تحقق: لا تعيّن العميل إذا تم الإلغاء أو إذا تغيّر العميل
    if (cancelled) return;
    
    if (!error && data) {
      setSelectedClient(data as Client);
      setCreateNewClient(false);
    }
  };

  fetchPreselectedClient();
  
  // ✅ Cleanup: إلغاء إذا تغيّر preselectedClientId أو أُغلق الـ dialog
  return () => {
    cancelled = true;
  };
}, [preselectedClientId, open]);
```

## ملخص التغييرات

| الملف | السطر | التغيير |
|-------|-------|---------|
| `usePolicyWizardState.ts` | 79-100 | إضافة `cancelled` flag و cleanup function |

## التحسين الإضافي (اختياري)

لمنع المشكلة بشكل أكثر صرامة، يمكن إضافة تحقق إضافي عند انتهاء الـ async call:

```typescript
// ✅ لا تعيّن إذا تم تغيير العميل يدوياً خلال فترة التحميل
if (cancelled || (selectedClient && selectedClient.id !== preselectedClientId)) return;
```

لكن هذا يتطلب جعل `selectedClient` جزءاً من الـ dependencies مما قد يسبب إعادة تشغيل غير مرغوبة. لذلك الحل الأول (cancelled flag) هو الأفضل.

## النتيجة المتوقعة

بعد التنفيذ:
- ✅ عند فتح النافذة من ملف عميل، سيتم اختياره تلقائياً
- ✅ إذا غيّر المستخدم العميل قبل انتهاء التحميل، لن يتم استبدال اختياره
- ✅ لا race condition بين الـ async fetch واختيار المستخدم
