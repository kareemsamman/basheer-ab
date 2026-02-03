
# خطة: تحسين نموذج إضافة العميل الجديد

## المشكلة الحالية

في صفحة العملاء عند الضغط على "إضافة عميل جديد" (`ClientDrawer.tsx`):
- حقل تاريخ الميلاد يستخدم `Calendar` component القديم
- لا يسمح بالكتابة اليدوية للتاريخ (DD/MM/YYYY)
- يختلف عن نموذج إنشاء العميل في wizard الذي يستخدم `ArabicDatePicker`

## الحل

استبدال `Calendar` + `Popover` بـ `ArabicDatePicker` في `ClientDrawer.tsx`

---

## التغييرات المطلوبة

### الملف: `src/components/clients/ClientDrawer.tsx`

#### 1. إزالة imports غير مستخدمة

```typescript
// إزالة:
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

// إضافة:
import { ArabicDatePicker } from '@/components/ui/arabic-date-picker';
```

#### 2. تعديل schema لقبول string بدلاً من Date

```typescript
// قبل:
birth_date: z.date().optional().nullable(),

// بعد:
birth_date: z.string().optional(),
```

#### 3. تحديث defaultValues

```typescript
// قبل:
birth_date: client?.birth_date ? new Date(client.birth_date) : null,

// بعد:
birth_date: client?.birth_date || '',
```

#### 4. تحديث حفظ البيانات

```typescript
// قبل:
birth_date: data.birth_date ? format(data.birth_date, 'yyyy-MM-dd') : null,

// بعد:
birth_date: data.birth_date || null,
```

#### 5. استبدال حقل تاريخ الميلاد (السطور 522-563)

```tsx
{/* Birth Date */}
<FormField
  control={form.control}
  name="birth_date"
  render={({ field }) => (
    <FormItem>
      <FormLabel>تاريخ الميلاد</FormLabel>
      <FormControl>
        <ArabicDatePicker
          value={field.value || ''}
          onChange={field.onChange}
          placeholder="اختر تاريخ الميلاد"
          isBirthDate
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## ملخص التغييرات

| الموقع | التغيير |
|--------|---------|
| Imports | استبدال Calendar/Popover بـ ArabicDatePicker |
| Schema | تغيير birth_date من Date إلى string |
| Form Field | استبدال Calendar+Popover بـ ArabicDatePicker |
| Save Logic | إزالة format() لأن القيمة بالفعل YYYY-MM-DD |

---

## النتيجة المتوقعة

- ✅ حقل تاريخ الميلاد يسمح بالكتابة اليدوية (DD/MM/YYYY)
- ✅ أيقونة التقويم تفتح popup للاختيار
- ✅ نفس تجربة المستخدم مثل wizard إنشاء الوثيقة
- ✅ دعم تاريخ الميلاد (1920-الحالي)
