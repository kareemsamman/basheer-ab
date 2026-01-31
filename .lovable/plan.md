
# خطة: تحسين واجهة تفاصيل Lead بأسلوب WhatsApp

## المطلوب
1. عند النقر على Lead، يفتح مباشرة **المحادثة WhatsApp-style** (بدون تبويبات)
2. إضافة **بانر تفاصيل** في الأعلى يعرض معلومات العميل والسيارة والسعر
3. **تحسين استايل الواجهة** ليكون أكثر أناقة
4. **إصلاح البيانات** في الجدول (الاسم، أنواع التأمين، السعر)

---

## التغييرات المطلوبة

### 1) تحسين `discover-redis-leads` لجلب بيانات أفضل

**المشكلة الحالية:** Parser لا يجلب كل البيانات من المحادثة

**الحل:** تحسين regex patterns لاستخراج:
- اسم العميل (من رسالة الترحيب)
- أنواع التأمين المطلوبة (إلزامي/شامل/طرف ثالث)
- السعر الإجمالي (من رسالة Bot النهائية)
- رقم السيارة
- هل يريد اتصال (من "تم تسجيل طلبك")

```text
Parsing تحسينات:
- "مرحباً [اسم]" → customer_name
- "السعر النهائي: ₪XXX" → total_price
- "تأمين إلزامي" / "تأمين شامل" → insurance_types[]
- رقم 7-8 أرقام → car_number
```

### 2) إعادة تصميم `LeadDetailsDrawer.tsx`

**التصميم الجديد - بدون Tabs:**

```text
┌──────────────────────────────────────────────────┐
│ ▼ (Drawer Handle)                                │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │  📱 WhatsApp Header                          │ │
│ │  اسم العميل  •  الحالة [جديد ▼]   ✕          │ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ │
│ │  📋 Quick Info Banner (Collapsed by default) │ │
│ │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │ │
│ │  │📞   │ │🚗   │ │💰   │ │🛡️   │            │ │
│ │  │هاتف │ │مازدا│ │₪2600│ │إلزامي│           │ │
│ │  └─────┘ └─────┘ └─────┘ └─────┘            │ │
│ │  [▼ عرض المزيد]                             │ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────┐                 │
│  │ 🤖 Bot                     │                 │
│  │ مرحباً! أنا بوت التأمين   │                 │
│  └────────────────────────────┘                 │
│                                                  │
│         ┌────────────────────────────┐          │
│         │ 👤 العميل                  │          │
│         │ 44944471                   │          │
│         └────────────────────────────┘          │
│                                                  │
│  ┌────────────────────────────┐                 │
│  │ 🤖 Bot                     │                 │
│  │ سيارتك مازدا 3 موديل 2010 │                 │
│  └────────────────────────────┘                 │
│                                                  │
│  ... المزيد من الرسائل ...                      │
│                                                  │
│  ┌────────────────────────────┐                 │
│  │ 🤖 Bot                     │                 │
│  │ تم تسجيل طلبك ✅           │                 │
│  │ ⚠️ طلب اتصال!              │                 │
│  └────────────────────────────┘                 │
│                                                  │
├──────────────────────────────────────────────────┤
│ 🔄 مزامنة  |  جاري مزامنة المحادثة...           │
└──────────────────────────────────────────────────┘
```

### 3) مكون جديد: `LeadInfoBanner.tsx`

بانر قابل للطي يعرض:
- **بطاقات سريعة:** الهاتف، السيارة، السعر، نوع التأمين
- **تفاصيل موسعة (عند الضغط):** كل المعلومات + تغيير الحالة
- **ألوان وأيقونات مميزة** لكل نوع معلومة

```typescript
// LeadInfoBanner Component Structure
interface LeadInfoBannerProps {
  lead: Lead;
  onStatusChange: (status: string) => void;
  isUpdating: boolean;
}

// Displays:
// - Quick cards row (phone, car, price, insurance)
// - Expandable details section
// - Status dropdown
// - Callback indicator (if requires_callback = true)
```

### 4) تحسين `LeadChatView.tsx`

- **إزالة Header المكرر** (سيكون في الـ Drawer)
- **تحسين ستايل الرسائل:**
  - رسائل Bot: خلفية خضراء فاتحة (مثل WhatsApp)
  - رسائل العميل: خلفية بيضاء مع border
  - Bubbles مع زوايا مدورة
  - وقت الرسالة لكل رسالة
- **تحسين Empty State**

### 5) تحسين sync-whatsapp-chat

إضافة تحديث بيانات Lead عند المزامنة:
```typescript
// في sync-whatsapp-chat/index.ts
// بعد مزامنة الرسائل، نحدث بيانات Lead إذا وجدنا معلومات جديدة

const parsedInfo = parseLeadInfoFromMessages(messages);
if (parsedInfo.total_price || parsedInfo.customer_name) {
  await supabase.from('leads').update({
    customer_name: parsedInfo.customer_name,
    total_price: parsedInfo.total_price,
    insurance_types: parsedInfo.insurance_types,
    // ... etc
  }).eq('id', leadId);
}
```

---

## ملخص الملفات

| الملف | النوع | الوصف |
|-------|-------|-------|
| `src/components/leads/LeadDetailsDrawer.tsx` | تعديل كبير | إزالة Tabs، تصميم WhatsApp-style |
| `src/components/leads/LeadInfoBanner.tsx` | جديد | بانر المعلومات القابل للطي |
| `src/components/leads/LeadChatView.tsx` | تعديل | تحسين ستايل الرسائل |
| `supabase/functions/discover-redis-leads/index.ts` | تعديل | تحسين parser لاستخراج بيانات أفضل |
| `supabase/functions/sync-whatsapp-chat/index.ts` | تعديل | تحديث Lead data عند المزامنة |

---

## تفاصيل تقنية

### WhatsApp Message Styling

```css
/* رسائل Bot - أخضر WhatsApp */
.bot-message {
  background: linear-gradient(135deg, #dcf8c6 0%, #d4f5bd 100%);
  border-radius: 8px 8px 0 8px;
  margin-left: auto;
}

/* رسائل العميل - أبيض */
.human-message {
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 8px 8px 8px 0;
  margin-right: auto;
}
```

### Info Banner Cards

```typescript
const infoCards = [
  { icon: Phone, label: "الهاتف", value: lead.phone, color: "blue" },
  { icon: Car, label: "السيارة", value: `${lead.car_manufacturer} ${lead.car_model}`, color: "purple" },
  { icon: DollarSign, label: "السعر", value: `₪${lead.total_price}`, color: "green" },
  { icon: Shield, label: "التأمين", value: lead.insurance_types?.join(", "), color: "orange" },
];
```

### Parser تحسينات (discover-redis-leads)

```typescript
// استخراج السعر
const priceMatch = content.match(/السعر.*?(\d{3,5})/);
if (priceMatch) result.total_price = parseInt(priceMatch[1]);

// استخراج أنواع التأمين
if (content.includes("إلزامي")) result.insurance_types.push("إلزامي");
if (content.includes("شامل")) result.insurance_types.push("شامل");
if (content.includes("طرف ثالث")) result.insurance_types.push("طرف ثالث");

// استخراج الاسم من الترحيب
const nameMatch = content.match(/مرحباً?\s*!?\s*(.+?)،/);
if (nameMatch) result.customer_name = nameMatch[1].trim();
```

---

## النتيجة المتوقعة

1. عند فتح Lead: **المحادثة تظهر مباشرة** مع بانر معلومات في الأعلى
2. **تصميم WhatsApp-style** حقيقي مع ألوان ورسائل جميلة
3. **بيانات كاملة** في الجدول (الاسم، السعر، أنواع التأمين)
4. **تغيير الحالة** مباشرة من البانر
5. **مؤشر طلب اتصال** واضح إذا العميل طلب اتصال
