

# خطة: تحسين نظام المهام اليومية

## نظرة عامة

تحسينات متعددة على نظام المهام تشمل: خيارات الوقت كل نصف ساعة، تصفية تبويب "أنشأتها" لإظهار المهام للآخرين فقط، إضافة Badges للتبويبات، بانر إحصائيات تفصيلي، وتحسين UX/UI للبطاقات.

---

## 1) خيارات الوقت كل نصف ساعة

**الملف:** `src/components/tasks/TaskDrawer.tsx`

**التغيير:** تعديل `TIME_OPTIONS` لتشمل الأوقات بفواصل 30 دقيقة

**قبل (السطور 44-50):**
```typescript
const TIME_OPTIONS = Array.from({ length: 18 }, (_, i) => {
  const hour = i + 6;
  return {
    value: `${hour.toString().padStart(2, '0')}:00`,
    label: `${hour.toString().padStart(2, '0')}:00`,
  };
});
```

**بعد:**
```typescript
const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const minutes = (i % 2) * 30;
  const timeStr = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  return { value: timeStr, label: timeStr };
});
// النتيجة: 06:00, 06:30, 07:00, 07:30, ... , 23:30
```

---

## 2) تبويب "أنشأتها" - إظهار المهام للآخرين فقط

**الملف:** `src/pages/Tasks.tsx`

**التغيير:** في تبويب "أنشأتها"، عرض فقط المهام التي أنشأتها لأشخاص غيرك

**قبل (السطور 51-62):**
```typescript
const filteredTasks = tasks.filter(task => {
  switch (filterTab) {
    case 'my-tasks':
      return task.assigned_to === user?.id;
    case 'created-by-me':
      return task.created_by === user?.id;
    case 'all':
      return true;
    default:
      return true;
  }
});
```

**بعد:**
```typescript
const filteredTasks = tasks.filter(task => {
  switch (filterTab) {
    case 'my-tasks':
      return task.assigned_to === user?.id;
    case 'created-by-me':
      // فقط المهام التي أنشأتها للآخرين (وليس لنفسي)
      return task.created_by === user?.id && task.assigned_to !== user?.id;
    case 'all':
      return true;
    default:
      return true;
  }
});
```

---

## 3) إضافة Badges للتبويبات

**الملف:** `src/pages/Tasks.tsx`

**التغيير:** إضافة Badge لكل تبويب يظهر عدد المهام

```tsx
{/* Filter Tabs with Badges */}
<Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)}>
  <TabsList>
    <TabsTrigger value="my-tasks" className="relative gap-2">
      مهامي
      {myTasksCount > 0 && (
        <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">
          {myTasksCount}
        </Badge>
      )}
    </TabsTrigger>
    <TabsTrigger value="created-by-me" className="relative gap-2">
      أنشأتها للآخرين
      {createdForOthersCount > 0 && (
        <Badge variant="outline" className="h-5 min-w-[20px] px-1.5 text-xs">
          {createdForOthersCount}
        </Badge>
      )}
    </TabsTrigger>
    {isAdmin && (
      <TabsTrigger value="all" className="relative gap-2">
        الكل
        <Badge variant="outline" className="h-5 min-w-[20px] px-1.5 text-xs">
          {tasks.length}
        </Badge>
      </TabsTrigger>
    )}
  </TabsList>
</Tabs>
```

**حساب الأعداد:**
```typescript
// إحصائيات للتبويبات
const myTasksCount = tasks.filter(t => t.assigned_to === user?.id && t.status === 'pending').length;
const createdForOthersCount = tasks.filter(t => 
  t.created_by === user?.id && t.assigned_to !== user?.id
).length;
```

---

## 4) بانر إحصائيات تفصيلي

**الملف:** `src/pages/Tasks.tsx`

**التغيير:** إضافة بانر جديد بإحصائيات شاملة مع Progress bar

```tsx
{/* Stats Summary Banner */}
<Card className="bg-gradient-to-l from-violet-50 to-white border-violet-200">
  <CardContent className="py-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* مهامي المعلقة */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold ltr-nums">{myPendingCount}</p>
          <p className="text-sm text-muted-foreground">مهامي المعلقة</p>
        </div>
      </div>

      {/* مهامي المنجزة */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold ltr-nums">{myCompletedCount}</p>
          <p className="text-sm text-muted-foreground">أنجزتها اليوم</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex-1 min-w-[150px] max-w-[200px]">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">إنجازي</span>
          <span className="font-medium ltr-nums">{completionPercentage}%</span>
        </div>
        <Progress value={completionPercentage} className="h-2" />
      </div>

      {/* المهام للآخرين */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold ltr-nums">{createdForOthersCount}</p>
          <p className="text-sm text-muted-foreground">أنشأتها للآخرين</p>
        </div>
      </div>

      {/* متأخرة */}
      {stats.overdue > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold ltr-nums">{stats.overdue}</p>
            <p className="text-sm text-muted-foreground">متأخرة</p>
          </div>
        </div>
      )}
    </div>
  </CardContent>
</Card>
```

**حساب الإحصائيات:**
```typescript
// إحصائيات مفصلة
const myTasks = tasks.filter(t => t.assigned_to === user?.id);
const myPendingCount = myTasks.filter(t => t.status === 'pending').length;
const myCompletedCount = myTasks.filter(t => t.status === 'completed').length;
const myTotalCount = myPendingCount + myCompletedCount;
const completionPercentage = myTotalCount > 0 
  ? Math.round((myCompletedCount / myTotalCount) * 100) 
  : 0;
```

---

## 5) تحسين UX/UI للبطاقات

**الملف:** `src/components/tasks/TaskCard.tsx`

### التحسينات:

**أ) تصميم أنظف وأكثر وضوحاً:**
```tsx
<Card className={cn(
  "transition-all duration-200 hover:shadow-lg group",
  isCompleted && "opacity-60 bg-muted/20",
  overdue && "border-r-4 border-r-destructive bg-destructive/5",
  !isCompleted && !overdue && "border-r-4 border-r-primary/30"
)}>
```

**ب) تحسين عرض الوقت:**
```tsx
<div className={cn(
  "flex flex-col items-center justify-center min-w-[70px] py-3 px-3 rounded-xl",
  "shadow-sm",
  isCompleted ? "bg-green-50 text-green-700 border border-green-200" :
  overdue ? "bg-red-50 text-red-600 border border-red-200" :
  "bg-primary/5 text-primary border border-primary/20"
)}>
  <Clock className="h-4 w-4 mb-1" />
  <span className="text-base font-bold font-mono ltr-nums">
    {formatTime(task.due_time)}
  </span>
</div>
```

**ج) تحسين معلومات التعيين:**
```tsx
{/* Assignment info with better styling */}
<div className="flex items-center gap-2 mt-3">
  <div className={cn(
    "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
    isCreatedByMe && !isAssignedToMe 
      ? "bg-violet-100 text-violet-700" 
      : "bg-gray-100 text-gray-600"
  )}>
    <User className="h-3 w-3" />
    {isCreatedByMe && isAssignedToMe ? (
      <span>مهمة شخصية</span>
    ) : (
      <span>
        {isCreatedByMe ? `→ ${assigneeName}` : `من: ${creatorName}`}
      </span>
    )}
  </div>
</div>
```

**د) زر إنجاز أوضح:**
```tsx
{!isCompleted && (
  <Button
    size="sm"
    variant={overdue ? "destructive" : "default"}
    className={cn(
      "h-9 px-4 gap-1.5",
      !overdue && "bg-green-600 hover:bg-green-700"
    )}
    onClick={handleComplete}
    disabled={completing}
  >
    <Check className="h-4 w-4" />
    إنجاز
  </Button>
)}
```

---

## 6) إزالة بطاقات الإحصائيات القديمة

**الملف:** `src/pages/Tasks.tsx`

**التغيير:** حذف الـ 3 Cards القديمة (السطور 162-204) واستبدالها بالبانر الجديد الموحد.

---

## ملخص الملفات

| الملف | التغيير |
|-------|---------|
| `src/components/tasks/TaskDrawer.tsx` | TIME_OPTIONS كل 30 دقيقة |
| `src/pages/Tasks.tsx` | فلتر "أنشأتها للآخرين"، Badges، بانر إحصائيات جديد |
| `src/components/tasks/TaskCard.tsx` | تحسين التصميم والـ UX |

---

## النتيجة المتوقعة

- اختيار الوقت بفواصل نصف ساعة (06:00, 06:30, 07:00, ...)
- تبويب "أنشأتها" يعرض فقط المهام المسندة للآخرين
- Badge على كل تبويب يظهر عدد المهام
- بانر إحصائيات شامل بتصميم أنيق مع Progress bar
- بطاقات مهام محسنة بتصميم أوضح وألوان أفضل

