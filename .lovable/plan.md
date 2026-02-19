
# إضافة عمود تاريخ النهاية + تعديل بيانات البوليصة من الجدول

## ما سيتغير

### 1. إضافة عمود "تاريخ النهاية" في الجدول
عمود جديد بعد "تاريخ البداية" يعرض `end_date` للبوليصة.

### 2. تعديل الحقول التالية بالضغط عليها مباشرة (inline edit)
عند الضغط على زر التعديل (القلم) الموجود حالياً، ستصبح هذه الحقول قابلة للتعديل أيضاً:

| الحقل | طريقة التعديل | يحفظ في |
|-------|-------------|---------|
| **نوع التأمين** | Select (ثالث / شامل / إلزامي...) | `policies.policy_type_parent` + `policy_type_child` |
| **تصنيف السيارة** | Select (خصوصي / شحن / تاكسي...) | `cars.car_type` |
| **اسم العميل** | Input نصي | `clients.full_name` |
| **تاريخ الإصدار** | ArabicDatePicker | `policies.issue_date` |
| **تاريخ البداية** | ArabicDatePicker | `policies.start_date` |
| **تاريخ النهاية** | ArabicDatePicker | `policies.end_date` |
| **الشركة** | Select (قائمة شركات التأمين) | `policies.company_id` |

### 3. لا تغيير على رقم السيارة (كما طلبت)

---

## التفاصيل التقنية

### ملف: `src/pages/CompanySettlementDetail.tsx`

**1. توسيع `editValues` state:**
```typescript
const [editValues, setEditValues] = useState({
  insurance_price: 0,
  payed_for_company: 0,
  profit: 0,
  car_value: 0,
  // New fields:
  policy_type_parent: '' as string,
  policy_type_child: '' as string | null,
  car_type: '' as string,
  client_name: '',
  issue_date: '' as string | null,
  start_date: '',
  end_date: '',
  company_id: '' as string | null,
});
```

**2. جلب قائمة شركات التأمين** عند فتح الصفحة (لاستخدامها في Select الشركة).

**3. إضافة عمود "تاريخ النهاية"** في TableHeader و TableBody.

**4. تحويل الخلايا إلى مكونات تعديل** عند `isEditing`:
- نوع التأمين: `Select` مع خيارات من `POLICY_TYPE_LABELS`، وإذا اختار `THIRD_FULL` يظهر select ثاني (ثالث/شامل)
- تصنيف السيارة: `Select` مع الخيارات (خصوصي، شحن، تاكسي...)
- اسم العميل: `Input` نصي
- التواريخ: `ArabicDatePicker` مصغر (`compact`)
- الشركة: `Select` مع قائمة الشركات

**5. تحديث `handleSaveEdit`** ليحفظ الحقول الجديدة:
- `policies` table: `policy_type_parent`, `policy_type_child`, `issue_date`, `start_date`, `end_date`, `company_id`
- `cars` table: `car_type`, `car_value`
- `clients` table: `full_name`

**6. ملاحظة مهمة**: إذا غيّر المستخدم الشركة، البوليصة ستختفي من هذا التقرير لأنها لم تعد تنتمي لنفس الشركة. سيظهر تنبيه قبل الحفظ.

### لا تغييرات في قاعدة البيانات
### لا ملفات جديدة
