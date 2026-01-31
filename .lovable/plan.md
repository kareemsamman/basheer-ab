
# خطة: إصلاح صفحة بلاغ الحادث وإضافة الميزات المفقودة

## ✅ المشاكل المُحلّة

### 1) ✅ خطأ 404 عند النقر على "عرض" من ملف العميل
- تمت إضافة route جديد `/accidents/:reportId` في `App.tsx`
- `AccidentReportForm` الآن يدعم الفتح بـ reportId فقط (يجلب policyId تلقائياً من البلاغ)

### 2) ✅ صفحة بلاغ الحادث تفتقر لميزات موجودة في ملف العميل
- تمت إضافة dropdown لتغيير الحالة (مسودة/مُقدَّم/مُغلق)
- تمت إضافة زر للملاحظات مع dialog كامل
- تمت إضافة زر للتذكيرات مع dialog كامل

### 2) صفحة بلاغ الحادث تفتقر لميزات موجودة في ملف العميل
- لا يوجد dropdown لتغيير الحالة (مسودة/مُقدَّم/مُغلق)
- لا يوجد زر للملاحظات
- لا يوجد زر للتذكيرات

### 3) التعديلات المحفوظة لا تظهر في المعاينة
- هذا يتطلب التحقق من أن `save-accident-edits` يعمل بشكل صحيح
- والتأكد من أن `generate-accident-pdf` يستخدم `edited_fields_json` عند إعادة الإنشاء

---

## الحلول المقترحة

### 1) إضافة Route جديد للوصول المباشر للبلاغ

إضافة route جديد في `App.tsx`:
```tsx
<Route path="/accidents/:reportId" element={
  <ProtectedRoute>
    <AccidentReportDetail />
  </ProtectedRoute>
} />
```

هذا الـ route سيفتح صفحة تفصيلية للبلاغ تجلب الـ policyId تلقائياً من قاعدة البيانات.

### 2) إنشاء صفحة جديدة أو تعديل الموجودة

**الخيار المختار:** تعديل `AccidentReportForm.tsx` ليدعم الفتح بـ reportId فقط (بدون policyId)

**التعديلات:**
```tsx
// في AccidentReportForm.tsx
const { policyId, reportId } = useParams<{ policyId?: string; reportId?: string }>();

useEffect(() => {
  if (reportId && !policyId) {
    // جلب الـ policyId من البلاغ
    fetchReportAndPolicy(reportId);
  }
}, [reportId, policyId]);
```

### 3) إضافة أدوات الإدارة في صفحة البلاغ

**إضافة شريط أدوات جديد في الـ Header:**

```tsx
<div className="flex items-center gap-3">
  {/* Status Dropdown */}
  <Select value={report.status} onValueChange={handleStatusChange}>
    <SelectTrigger className={cn("w-[130px]", statusColors[report.status])}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="draft">مسودة</SelectItem>
      <SelectItem value="submitted">مُقدَّم</SelectItem>
      <SelectItem value="closed">مُغلق</SelectItem>
    </SelectContent>
  </Select>
  
  {/* Notes Button */}
  <Button variant="outline" onClick={() => setNoteDialogOpen(true)}>
    <MessageSquare className="h-4 w-4 ml-2" />
    ملاحظات {notesCount > 0 && `(${notesCount})`}
  </Button>
  
  {/* Reminder Button */}
  <Button 
    variant={hasActiveReminder ? "default" : "outline"} 
    onClick={() => setReminderDialogOpen(true)}
  >
    <Clock className={cn("h-4 w-4 ml-2", hasActiveReminder && "animate-pulse")} />
    تذكير
  </Button>
</div>
```

### 4) إضافة Dialogs للملاحظات والتذكيرات

استخدام نفس الـ logic من `ClientAccidentsTab`:

```tsx
// Notes Dialog
<Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
  {/* محتوى مشابه لـ ClientAccidentsTab */}
</Dialog>

// Reminder Dialog
<Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
  {/* محتوى مشابه لـ ClientAccidentsTab */}
</Dialog>
```

### 5) إصلاح رابط "عرض" في ClientAccidentsTab

تغيير من:
```tsx
onClick={() => navigate(`/accidents/${report.id}`)}
```

إلى:
```tsx
onClick={() => {
  // جلب policy_id من البلاغ للتنقل الصحيح
  // أو استخدام الـ route الجديد /accidents/:reportId
}}
```

---

## تفاصيل التعديلات

### ملف App.tsx

إضافة route جديد:
```tsx
{/* Direct accident report access */}
<Route path="/accidents/:reportId" element={
  <ProtectedRoute>
    <AccidentReportForm />
  </ProtectedRoute>
} />
```

### ملف AccidentReportForm.tsx

**التعديلات الرئيسية:**

1. **دعم الفتح بـ reportId فقط:**
   - إذا لم يكن policyId موجود، يتم جلبه من البلاغ نفسه

2. **إضافة حالة جديدة:**
   ```tsx
   // Notes & Reminders state
   const [noteDialogOpen, setNoteDialogOpen] = useState(false);
   const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
   const [reportNotes, setReportNotes] = useState<AccidentNote[]>([]);
   const [reminders, setReminders] = useState<AccidentReminder[]>([]);
   const [notesCount, setNotesCount] = useState(0);
   const [hasActiveReminder, setHasActiveReminder] = useState(false);
   ```

3. **إضافة dropdown الحالة في Header**

4. **إضافة أزرار الملاحظات والتذكيرات**

5. **إضافة Dialogs للملاحظات والتذكيرات**

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `src/App.tsx` | تعديل | إضافة route `/accidents/:reportId` |
| `src/pages/AccidentReportForm.tsx` | تعديل كبير | دعم الفتح بـ reportId، إضافة حالة/ملاحظات/تذكيرات |
| `src/components/clients/ClientAccidentsTab.tsx` | تعديل طفيف | تصحيح رابط التنقل |

---

## النتيجة المتوقعة

1. **النقر على "عرض" من ملف العميل** → يفتح صفحة البلاغ بدون خطأ 404
2. **صفحة البلاغ** تحتوي على:
   - Dropdown لتغيير الحالة (في الـ Header)
   - زر ملاحظات مع عدد الملاحظات
   - زر تذكير مع مؤشر للتذكيرات النشطة
3. **حفظ التعديلات** → تظهر في المعاينة HTML عند الفتح مرة أخرى

---

## ملاحظة حول حفظ التعديلات في HTML

التعديلات **محفوظة في قاعدة البيانات** في عمود `edited_fields_json`. عند إعادة إنشاء الـ PDF (بالضغط على "إنشاء PDF" مرة أخرى)، سيتم استخدام البيانات المحفوظة.

لكن إذا كان الملف HTML موجود بالفعل على CDN ولم يتم تحديثه، فقد لا تظهر التغييرات. الـ `save-accident-edits` يقوم بتحديث الملف على CDN تلقائياً عند الحفظ.
