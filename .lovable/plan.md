

# خطة: نقل حقل البحث إلى أعلى الـ Sidebar

## الهدف
نقل حقل بحث الصفحات ليكون **داخل الـ Sidebar** فوق قسم "الرئيسية" مباشرة، بدلاً من كونه Dialog منفصل في الـ Header.

---

## التصميم الجديد

```text
┌─────────────────────────────────┐
│  [AB تأمين]  [Logo]             │
├─────────────────────────────────┤
│  🔍 ابحث عن صفحة...            │  ← حقل البحث هنا
├─────────────────────────────────┤
│  ∨ 🏠 الرئيسية                  │
│     📊 لوحة التحكم              │
│     ✅ المهام                   │
│     🔔 التنبيهات                │
│                                 │
│  ∨ 👥 إدارة العملاء             │
│     ...                         │
└─────────────────────────────────┘
```

---

## التعديلات المطلوبة

### 1) مكون جديد: `SidebarSearch.tsx`
**ملف:** `src/components/layout/SidebarSearch.tsx`

**الميزات:**
- حقل Input بتصميم مناسب للـ Sidebar
- عند الكتابة → تظهر قائمة dropdown بالنتائج
- فلترة تلقائية حسب الاسم
- عند الاختيار → انتقال للصفحة
- يختفي عندما يكون الـ Sidebar مطوي (collapsed)
- اختصار `Ctrl+/` يُركز على حقل البحث

**الهيكل:**
```tsx
export function SidebarSearch({ collapsed }: { collapsed: boolean }) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  
  // فلترة النتائج
  const results = filteredGroups
    .flatMap(g => g.items)
    .filter(item => item.name.includes(query));
  
  if (collapsed) return null;
  
  return (
    <div className="px-3 py-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ابحث عن صفحة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowResults(true)}
          className="pr-9 text-right"
        />
        {showResults && query && results.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-lg z-50">
            {results.map(item => (
              <button onClick={() => navigate(item.href)}>
                <item.icon /> {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2) تحديث Sidebar.tsx
**ملف:** `src/components/layout/Sidebar.tsx`

**التعديلات:**
- استيراد `SidebarSearch`
- إضافته بعد الـ Logo وقبل الـ Navigation

```tsx
// بعد قسم Logo
<SidebarSearch collapsed={collapsed} />

// ثم Navigation
<nav className="flex-1 ...">
```

### 3) تحديث Header.tsx
**ملف:** `src/components/layout/Header.tsx`

**التعديلات:**
- إزالة زر بحث الصفحات (FileSearch icon)
- إزالة مكون NavigationSearch
- إبقاء بحث الوثائق فقط (GlobalPolicySearch)

### 4) حذف أو تحويل NavigationSearch.tsx
**ملف:** `src/components/layout/NavigationSearch.tsx`

**الخيارات:**
- حذف الملف إذا لم نعد نحتاج Dialog
- أو الإبقاء عليه كـ fallback للأجهزة الصغيرة

---

## الملفات المطلوبة

| الملف | النوع | الوصف |
|-------|-------|-------|
| `src/components/layout/SidebarSearch.tsx` | جديد | مكون البحث داخل الـ Sidebar |
| `src/components/layout/Sidebar.tsx` | تعديل | إضافة SidebarSearch |
| `src/components/layout/Header.tsx` | تعديل | إزالة زر البحث عن الصفحات |

---

## السلوك المتوقع

1. **الـ Sidebar موسّع**: يظهر حقل البحث فوق "الرئيسية"
2. **الـ Sidebar مطوي**: يختفي حقل البحث (لا يوجد مساحة)
3. **Mobile**: يظهر في الـ Sheet drawer
4. **اختصار `Ctrl+/`**: يُركز على حقل البحث (إذا كان مرئي)
5. **عند الكتابة**: تظهر dropdown بالنتائج المطابقة
6. **عند الاختيار**: ينتقل للصفحة ويُغلق القائمة

