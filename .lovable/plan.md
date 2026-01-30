

# خطة: إضافة زر "إرسال للعميل" + تعديل Footer الفواتير

## المشكلة الحالية

1. **الفواتير HTML** (تقرير شامل + فاتورة مفردة) تحتوي فقط على زر "طباعة الفاتورة" ولا يوجد زر لإرسال الرابط للعميل عبر SMS
2. **الواتساب** يظهر كرابط `wa.me/` - المستخدم يفضل عرض رقم الهاتف مع `tel:` href أو رابط واتساب

## أين تعديل بيانات الشركة؟

**المسار:** الإعدادات ← إعدادات SMS ← تبويب "بيانات الشركة"

| الحقل | الوصف |
|-------|-------|
| البريد الإلكتروني | `company_email` |
| أرقام الهواتف | `company_phones` (مصفوفة - يمكن إضافة أكثر من رقم) |
| رقم الواتساب | `company_whatsapp` |
| العنوان | `company_location` |

---

## التغييرات المطلوبة

### 1) تعديل Footer في جميع HTML Functions

**الملفات:**
- `supabase/functions/generate-client-payments-invoice/index.ts` (التقرير الشامل)
- `supabase/functions/send-invoice-sms/index.ts` (الفاتورة المفردة)
- `supabase/functions/send-package-invoice-sms/index.ts` (فاتورة الباقة)
- `supabase/functions/generate-payment-receipt/index.ts` (إيصال الدفعة)
- `supabase/functions/generate-client-report/index.ts` (تقرير العميل)

**التغيير في Footer:**

**قبل (الحالي):**
```html
<div class="contact-row">
  <span>📞</span>
  <span>052-1234567 | 04-6555123</span>
</div>
<div class="contact-row">
  <span>💬</span>
  <a href="https://wa.me/9721234567">واتساب</a>
</div>
```

**بعد (المقترح):**
```html
<div class="contact-row">
  <span>📞</span>
  ${companyPhones.map(phone => 
    `<a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a>`
  ).join(' | ')}
</div>
<div class="contact-row">
  <span>💬</span>
  <a href="https://wa.me/${whatsappNormalized}">${companyWhatsapp}</a>
</div>
```

**النتيجة:**
- أرقام الهواتف قابلة للنقر → تفتح تطبيق الاتصال على الموبايل
- الواتساب يظهر الرقم بدلاً من "واتساب" فقط
- الرابطان يعملان: `tel:` للاتصال و`wa.me/` للواتساب

---

### 2) إضافة زر "إرسال للعميل" في HTML Invoices

**المنطق:**
- الزر سيستخدم `mailto:` أو share API للموبايل
- أو نجعله يفتح WhatsApp مع رسالة جاهزة تحتوي على رابط الفاتورة

**التغيير في كل HTML Template:**

```html
<div class="footer">
  <p class="thank-you">شكراً لتعاملكم معنا 🙏</p>
  <div class="contact-info">
    <!-- ... contact details ... -->
  </div>
  
  <!-- Buttons Container -->
  <div class="action-buttons no-print">
    <button class="print-button" onclick="window.print()">🖨️ طباعة الفاتورة</button>
    <button class="share-button" onclick="shareInvoice()">📲 مشاركة الفاتورة</button>
  </div>
</div>

<script>
function shareInvoice() {
  const currentUrl = window.location.href;
  const shareText = 'فاتورة التأمين: ' + currentUrl;
  
  // Try native share API (mobile)
  if (navigator.share) {
    navigator.share({
      title: 'فاتورة التأمين',
      text: 'فاتورة التأمين الخاصة بك',
      url: currentUrl
    }).catch(console.error);
  } else {
    // Fallback: open WhatsApp with pre-filled message
    const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(shareText);
    window.open(whatsappUrl, '_blank');
  }
}
</script>
```

**CSS للأزرار:**
```css
.action-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 15px;
}

.share-button {
  display: inline-block;
  padding: 12px 25px;
  background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Tajawal', sans-serif;
}

.share-button:hover { opacity: 0.9; }
```

---

### 3) إضافة زر SMS مباشر للموظفين (في CRM)

**الملف:** `src/components/clients/ClientDetails.tsx`

**التغيير:**
إضافة زر بجانب "فاتورة شاملة" يرسل الرابط مباشرة للعميل عبر 019sms

```tsx
const handleSendComprehensiveInvoice = async () => {
  setSendingInvoice(true);
  try {
    // First generate the invoice
    const { data, error } = await supabase.functions.invoke('generate-client-payments-invoice', {
      body: { client_id: client.id, send_sms: true }
    });
    
    if (error) throw error;
    toast.success("تم إرسال الفاتورة للعميل");
  } catch (error) {
    toast.error("فشل في إرسال الفاتورة");
  } finally {
    setSendingInvoice(false);
  }
};
```

**تحديث Edge Function:**
إضافة parameter `send_sms: boolean` للـ `generate-client-payments-invoice` function

---

## ملخص الملفات

| الملف | النوع | التغيير |
|-------|-------|---------|
| `generate-client-payments-invoice/index.ts` | Backend | Footer محدث + زر مشاركة + دعم SMS |
| `send-invoice-sms/index.ts` | Backend | Footer محدث + زر مشاركة |
| `send-package-invoice-sms/index.ts` | Backend | Footer محدث + زر مشاركة |
| `generate-payment-receipt/index.ts` | Backend | Footer محدث + زر مشاركة |
| `generate-client-report/index.ts` | Backend | Footer محدث + زر مشاركة |
| `ClientDetails.tsx` | Frontend | زر "إرسال SMS" للفاتورة الشاملة |

---

## النتيجة المتوقعة

1. ✅ كل HTML invoice يحتوي على زر "مشاركة" بجانب زر "طباعة"
2. ✅ أرقام الهواتف في Footer قابلة للنقر (`tel:` href)
3. ✅ رابط الواتساب يظهر الرقم + يفتح المحادثة
4. ✅ الموظف يمكنه إرسال الفاتورة الشاملة للعميل مباشرة من CRM
5. ✅ تعديل بيانات الشركة من: إعدادات SMS ← بيانات الشركة

