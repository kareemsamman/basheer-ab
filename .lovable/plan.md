
# خطة: إصلاح مشكلة نوع الوثيقة عند دفع الفيزا في الباقات

## تحليل المشكلة

### السيناريو المُكتشف:
عند إنشاء باقة مع دفعة فيزا:
1. المستخدم يختار فئة **THIRD_FULL** (ثالث/شامل)
2. في Step 3، يختار النوع الفرعي **THIRD** (ثالث) وشركة **اراضي مقدسة**
3. يُفعّل وضع الباقة ويُضيف:
   - إلزامي من **منورا**
   - خدمات طريق من **شركة اكس**
4. في Step 4، يدفع بالفيزا

### البيانات في قاعدة البيانات:
| الشركة | النوع الأب | النوع الفرعي | ملاحظات |
|--------|-----------|-------------|---------|
| منورا | THIRD_FULL | null | ❌ يجب أن يكون ELZAMI |
| اراضي مقدسة | THIRD_FULL | THIRD | ✅ صحيح (إضافة ضمن باقة) |
| شركة اكس | ROAD_SERVICE | null | ✅ صحيح (إضافة ضمن باقة) |

### السبب الجذري:
الكود في `handleCreateTempPolicy` (سطر 473-474):
```typescript
let policyTypeParentValue = (selectedCategory?.slug || policy.policy_type_parent) as PolicyTypeParent;
let policyTypeChildValue = (policy.policy_type_child || null) as PolicyTypeChild | null;
let tempCompanyId = policy.company_id;
```

**المشكلة:** الوثيقة المؤقتة تُنشأ بـ:
- `policy_type_parent = 'THIRD_FULL'` (من الفئة)
- `company_id` = شركة الوثيقة الرئيسية (اراضي مقدسة أو منورا)

لكن عندما يُفعّل المستخدم **إلزامي كإضافة**، الوثيقة المؤقتة يجب أن تكون **ELZAMI** لا **THIRD_FULL**.

**تحليل أعمق:** 
عند مراجعة بيانات الباقة `f1ef4b13-af49-4530-8341-0b8a7b904b75`:
- الوثيقة الأولى (منورا) أُنشئت في 12:23:30 بدون ملاحظات ← هذه هي الوثيقة المؤقتة
- اراضي مقدسة أُنشئت في 12:24:52 مع ملاحظة "إضافة ضمن باقة" ← هذه إضافة

هذا يعني أن `policy.company_id` كان **منورا** عند إنشاء الوثيقة المؤقتة!

**الاستنتاج:** المستخدم قد يكون قد غيّر الشركة في Step 3 أو أن هناك مشكلة في كيفية تحديث `policy.company_id`.

---

## التحقيق في المشكلة الحقيقية

بعد مراجعة الكود والبيانات، يبدو أن:
1. الوثيقة المؤقتة أُنشئت بشركة **منورا** ونوع **THIRD_FULL**
2. لكن منورا ليست من شركات THIRD_FULL - هي شركة ELZAMI!
3. المستخدم قد أدخل منورا في حقل الشركة الرئيسية بالخطأ، أو هناك خلط بين الإضافات والوثيقة الرئيسية

**الفرضية:** قد يكون المستخدم يختار شركة ELZAMI في الحقل الرئيسي بدلاً من إضافتها كإضافة. هذا يحدث لأن القائمة المنسدلة للشركات لا تُفلتر بشكل صحيح.

---

## الإصلاح المطلوب

### الإصلاح 1: التحقق من نوع الشركة في handleCreateTempPolicy

**الملف:** `src/components/policies/PolicyWizard.tsx`

**المنطق الجديد:**
1. إذا كان `packageMode` مفعّل
2. وتم اختيار شركة ELZAMI من الإضافات
3. فإن الوثيقة المؤقتة يجب أن تكون ELZAMI

```typescript
// In handleCreateTempPolicy, after getting policyTypeParentValue:

// For packages: if the first enabled addon is ELZAMI, use it for temp policy
// This handles cases where user wants ELZAMI + THIRD_FULL together
if (packageMode && packageAddons.some(a => a.enabled)) {
  const elzamiAddon = packageAddons.find(a => a.type === 'elzami' && a.enabled);
  
  if (elzamiAddon && elzamiAddon.company_id) {
    // The first policy in package should be ELZAMI
    policyTypeParentValue = 'ELZAMI' as PolicyTypeParent;
    policyTypeChildValue = null;
    tempCompanyId = elzamiAddon.company_id;
    tempInsurancePrice = parseFloat(elzamiAddon.insurance_price) || 0;
  }
}
```

### الإصلاح 2: تحديث handleSave لتجنب التكرار

**المنطق:** إذا أُنشئت الوثيقة المؤقتة كـ ELZAMI، يجب ألا ننشئ إضافة ELZAMI مرة أخرى.

```typescript
// In handleSave, when creating addon policies for Visa flow:
for (const addon of packageAddons) {
  if (!addon.enabled) continue;
  
  // Skip ELZAMI if temp policy was already created as ELZAMI
  if (addon.type === 'elzami' && tempPolicyIsElzami) continue;
  
  // ... create other addons
}
```

### الإصلاح 3: تحديث الوثيقة المؤقتة بالنوع الصحيح

في `handleSave`، بعد إنشاء `group_id`، يجب تحديث الوثيقة المؤقتة بالنوع الصحيح إذا كانت خاطئة:

```typescript
// After creating group_id in handleSave for Visa flow:
// Update temp policy with correct type based on first enabled addon
const firstAddon = packageAddons.find(a => a.enabled);
if (firstAddon) {
  const addonTypeMap = { 'elzami': 'ELZAMI', 'third_full': 'THIRD_FULL', ... };
  const correctType = addonTypeMap[firstAddon.type];
  
  await supabase
    .from('policies')
    .update({ 
      group_id: groupId,
      policy_type_parent: correctType,
      policy_type_child: firstAddon.type === 'third_full' ? firstAddon.policy_type_child : null,
      company_id: firstAddon.company_id,
      insurance_price: parseFloat(firstAddon.insurance_price),
      // ... recalculate profit
    })
    .eq('id', tempPolicyId);
}
```

---

## الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/policies/PolicyWizard.tsx` | إصلاح handleCreateTempPolicy و handleSave |

---

## النتيجة المتوقعة

1. ✅ الوثيقة المؤقتة ستُنشأ بالنوع الصحيح (ELZAMI إذا كانت الإضافة الأولى)
2. ✅ الشركة الصحيحة ستُستخدم (منورا للإلزامي)
3. ✅ لن تتكرر الوثائق (ELZAMI لن تُنشأ مرتين)
4. ✅ باقي الإضافات (THIRD_FULL, ROAD_SERVICE) ستُنشأ بشكل صحيح

---

## ملاحظة بخصوص الوثائق السابقة

الوثائق المُنشأة قبل هذا الإصلاح تحتاج تحديث يدوي في قاعدة البيانات لتصحيح:
- `policy_type_parent` من THIRD_FULL إلى ELZAMI
- للوثائق التي شركتها من شركات ELZAMI فقط
