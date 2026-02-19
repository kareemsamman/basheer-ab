

# تحسينات محرر النماذج - 4 ميزات جديدة

## المشاكل الحالية

1. **نسخ ولصق**: لا يمكن نسخ حقل نصي ولصقه (Ctrl+C / Ctrl+V)
2. **تنسيق النص**: لا توجد خيارات لتغيير اللون أو تعريض (Bold) أو تسطير (Underline)
3. **الطباعة غير دقيقة**: مواقع الحقول تتحرك عند الطباعة لأن الصورة تُعرض بحجم مختلف
4. **تغيير أبعاد الحقل**: لا يمكن تغيير عرض وارتفاع الحقل (resize) كمحرر حقيقي

## الحلول

### 1. نسخ ولصق (Ctrl+C / Ctrl+V)

- عند تحديد حقل والضغط على Ctrl+C، يُخزّن الحقل في state داخلي (`clipboard`)
- عند الضغط على Ctrl+V، يُلصق نسخة من الحقل بإزاحة بسيطة (20px) عن الأصل في نفس الصفحة الحالية
- يتم تسجيل `keydown` listener على مستوى الصفحة

### 2. تنسيق النص (لون + Bold + Underline)

- إضافة خصائص جديدة لكل حقل: `color` (لون)، `bold` (boolean)، `underline` (boolean)
- في لوحة الحقول الجانبية: أزرار Bold (B) و Underline (U) + color picker
- التنسيق يظهر على الحقل في المحرر وفي الطباعة

### 3. إصلاح الطباعة

- المشكلة: الحقول تُوضع بموقع pixel مطلق، لكن حجم الصورة في الطباعة يختلف عن المحرر
- الحل: تحويل مواقع الحقول إلى **نسب مئوية** من أبعاد الصورة الأصلية في HTML الطباعة
- بدل `left: 150px` نستخدم `left: (150/imgWidth*100)%` و `top: (200/imgHeight*100)%`
- هذا يضمن التطابق مهما كان حجم الصفحة المطبوعة

### 4. تغيير أبعاد الحقل (Resize)

- إضافة خصائص `width` و `height` لكل حقل (اختيارية، القيم الافتراضية auto)
- عند تحديد حقل، يظهر مقبض resize في الزاوية السفلية اليسرى
- السحب على المقبض يغيّر العرض والارتفاع
- النص داخل الحقل يلتف (word-wrap) حسب العرض المحدد

## التفاصيل التقنية

### تغيير OverlayField interface

```text
interface OverlayField {
  id: string;
  page: number;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  // جديد:
  color?: string;       // default: "#000000"
  bold?: boolean;        // default: false
  underline?: boolean;   // default: false
  width?: number;        // default: undefined (auto)
  height?: number;       // default: undefined (auto)
}
```

### ملف: `src/pages/FormTemplateEditor.tsx`

**تعديل 1 - نسخ/لصق:**
- إضافة `clipboardField` state
- إضافة `useEffect` مع `keydown` listener:
  - Ctrl+C: نسخ الحقل المحدد إلى clipboard
  - Ctrl+V: لصق نسخة بإزاحة 20px في الصفحة الحالية

**تعديل 2 - تنسيق النص:**
- في لوحة الحقول الجانبية: إضافة أزرار B و U و input color لكل حقل محدد
- تطبيق `fontWeight: bold`، `textDecoration: underline`، و `color` على الحقل
- تمرير نفس التنسيقات في HTML الطباعة

**تعديل 3 - طباعة دقيقة:**
- في `handlePrint`: حساب مواقع كنسب مئوية:
  ```text
  left: (field.x / naturalWidth * 100)%
  top: (field.y / naturalHeight * 100)%
  fontSize: (field.fontSize / naturalWidth * 100)vw  // أو نسبة ثابتة
  ```
- الصورة تأخذ `width: 100%` والحاوية `position: relative`

**تعديل 4 - Resize:**
- إضافة `resizingField` state و `resizeStart` للتتبع
- عند تحديد حقل، يظهر مقبض resize (مربع صغير بالزاوية)
- `mousedown` على المقبض يبدأ الـ resize
- `mousemove` يحدّث العرض والارتفاع
- الحقل يعرض بـ `width` و `height` إذا محددة، مع `overflow: hidden` و `word-wrap: break-word`

### لوحة خصائص الحقل المحدد (في الشريط الجانبي)

عند تحديد حقل، تظهر أدوات إضافية:
- **B** (Bold toggle)
- **U** (Underline toggle)  
- **Color picker** (input type="color")
- **A+/A-** (حجم الخط - موجود)
- **حذف** (موجود)

### لا تغييرات في قاعدة البيانات
الحقول الجديدة (color, bold, underline, width, height) تُخزّن ضمن JSONB الموجود `overlay_fields` - لا حاجة لتعديل schema.

