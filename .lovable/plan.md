
# خطة: إزالة زر جلب سعر السيارة + إضافة ملاحظات الوثيقة مع تحرير مباشر

## المطلوب ✅ مكتمل

### 1. ✅ إزالة زر جلب قيمة السيارة (RefreshCw)
تم إزالة الزر من Step3PolicyDetails.tsx وإبقاء حقل الإدخال فقط.

### 2. ✅ عرض ملاحظات الوثيقة مع تحرير مباشر (Inline Edit)
تم إضافة عرض وتحرير الملاحظات في PolicyYearTimeline:
- إذا كانت هناك ملاحظات: تُعرض تحت بطاقة الوثيقة ويمكن تحريرها بالنقر عليها
- إذا لم تكن هناك ملاحظات: يظهر نص "لا توجد ملاحظات - اضغط للإضافة"

---

## التغييرات المنفذة

### الملف 1: `src/components/policies/wizard/Step3PolicyDetails.tsx`
- ✅ إزالة import لـ RefreshCw
- ✅ إزالة state لـ fetchingCarValue
- ✅ إزالة زر Button مع RefreshCw icon
- ✅ إبقاء Input فقط بعرض كامل

### الملف 2: `src/components/clients/ClientDetails.tsx`
- ✅ إضافة notes للاستعلام في fetchPolicies
- ✅ تحديث PolicyRecord interface لإضافة notes
- ✅ تمرير onPoliciesUpdate إلى PolicyYearTimeline

### الملف 3: `src/components/clients/PolicyYearTimeline.tsx`
- ✅ إضافة imports جديدة (Textarea, MessageSquare, Save, X)
- ✅ تحديث PolicyRecord interface لإضافة notes
- ✅ إضافة props جديدة للتحكم بالملاحظات
- ✅ إضافة state للتحرير المباشر (editingNotesId, editedNotesValue, savingNotes)
- ✅ إضافة handleNotesUpdate function
- ✅ تمرير props الملاحظات إلى PolicyPackageCard
- ✅ إضافة قسم عرض/تحرير الملاحظات في نهاية البطاقة

---

## النتيجة

1. ✅ حقل قيمة السيارة في Step3 يظهر كحقل إدخال بسيط بدون زر جلب
2. ✅ كل بطاقة وثيقة في الـ Timeline تعرض الملاحظات (أو "لا توجد ملاحظات")
3. ✅ النقر على الملاحظات يفتح تحريراً مباشراً
4. ✅ التغييرات تُحفظ عند الضغط على "حفظ" أو Ctrl+Enter
5. ✅ يمكن الإلغاء بـ Escape أو زر "إلغاء"
