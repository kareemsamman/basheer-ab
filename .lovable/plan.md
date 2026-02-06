

# إصلاح رسالة التذكير اليدوي - send-manual-reminder

## المشاكل المكتشفة

| المشكلة | الموقع في الكود | الحل |
|---------|-----------------|------|
| لا يوجد footer للشركة | سطر 168-176 | إضافة footer كما في bulk-sms |
| "الوثائق:" تظهر حتى لو فارغة | سطر 173-174 | إضافة شرط: إذا لا يوجد policies، لا تعرض "الوثائق:" |

## المقارنة بين الملفين

### send-bulk-debt-sms (الصحيح) ✅
```javascript
// سطر 121-124 - جلب footer
const companyLocation = smsSettings.company_location || '';
const phoneLinks = (smsSettings.company_phone_links as any[]) || [];
const phones = phoneLinks.map((p: any) => p.phone).filter(Boolean).join(' | ');

// سطر 181-199 - بناء الرسالة
let message = `مرحباً ${clientName}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}

الوثائق:
${policyLines}

AB للتأمين`;

if (companyLocation) {
  message += `\n📍 ${companyLocation}`;
}
if (phones) {
  message += `\n📞 ${phones}`;
}
```

### send-manual-reminder (الخاطئ) ❌
```javascript
// سطر 168-176 - بناء الرسالة بدون footer!
finalMessage = `مرحباً ${client.full_name}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}

الوثائق:
${policyLines}

يرجى التواصل معنا للتسوية.`;
```

## التغييرات المطلوبة

### الملف: `supabase/functions/send-manual-reminder/index.ts`

#### 1. إضافة جلب footer الشركة (بعد سطر 120)

```typescript
// Get company footer info from SMS settings
const companyLocation = smsSettings.company_location || '';
const phoneLinks = (smsSettings.company_phone_links as any[]) || [];
const phones = phoneLinks.map((p: any) => p.phone).filter(Boolean).join(' | ');
```

#### 2. تعديل بناء الرسالة (سطر 168-176)

**قبل:**
```typescript
finalMessage = `مرحباً ${client.full_name}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}

الوثائق:
${policyLines}

يرجى التواصل معنا للتسوية.`;
```

**بعد:**
```typescript
// Build policy section only if there are policies
const policySection = policyLines.length > 0 
  ? `\n\nالوثائق:\n${policyLines}` 
  : '';

// Build final message with policy details and footer
let finalMessage = `مرحباً ${client.full_name}،

عليك تسديد المبلغ: ₪${totalRemaining.toLocaleString()}${policySection}

AB للتأمين`;

// Add location if available
if (companyLocation) {
  finalMessage += `\n📍 ${companyLocation}`;
}

// Add phones if available
if (phones) {
  finalMessage += `\n📞 ${phones}`;
}
```

---

## الرسالة النهائية المتوقعة

### إذا يوجد وثائق:
```
مرحباً Kareem Test،

عليك تسديد المبلغ: ₪10,098

الوثائق:
• شامل - 1234567 - ₪5,000
• إلزامي - 1234567 - ₪3,098
• خدمات طريق - ₪2,000

AB للتأمين
📍 الناصرة، شارع الرئيسي
📞 04-1234567 | 050-1234567
```

### إذا لا يوجد وثائق (مثل حالتك):
```
مرحباً Kareem Test،

عليك تسديد المبلغ: ₪10,098

AB للتأمين
📍 الناصرة، شارع الرئيسي
📞 04-1234567 | 050-1234567
```

---

## ملخص التغييرات

| السطر | التغيير |
|-------|---------|
| بعد 120 | إضافة جلب `companyLocation` و `phones` من SMS settings |
| 156-166 | تحديث `policyLines` ليكون متغير منفصل |
| 168-177 | إعادة كتابة بناء الرسالة مع شرط للوثائق + footer الشركة |

---

## سبب المشكلة الأصلية

الكود الحالي:
1. **لا يستخدم footer** - يكتفي بـ "يرجى التواصل معنا للتسوية"
2. **لا يتحقق من وجود وثائق** - يعرض "الوثائق:" دائماً حتى لو `policyLines` فارغ

النتيجة التي رأيتها:
```
مرحباً Kareem Test،
عليك تسديد المبلغ: ₪10,098

الوثائق:

يرجى التواصل معنا للتسوية.
```

بدلاً من:
```
مرحباً Kareem Test،
عليك تسديد المبلغ: ₪10,098

AB للتأمين
📍 ...
📞 ...
```

