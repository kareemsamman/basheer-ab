# خطة إصلاح قص صور الشيكات - تم التنفيذ ✅

## ما تم تنفيذه

### 1. تحسين Edge Function (`process-cheque-scan`)
- ✅ استخدام `gemini-2.5-pro` بدلاً من `gemini-2.5-flash` للدقة الأفضل
- ✅ تحسين prompt مع chain-of-thought reasoning
- ✅ إضافة دليل مرجعي لـ bounding box للشيكات المتعددة
- ✅ التحقق من صحة وتقييد قيم bounding box

### 2. تحسين ChequeScannerDialog
- ✅ إضافة `base64ToBlob` helper function
- ✅ تحسين `cropImageOnClient` مع التحقق من الصحة
- ✅ إضافة كشف الصور السوداء (brightness check)
- ✅ رفع الصور المقصوصة فوراً لـ CDN عبر `uploadChequeImageToCDN`

### 3. إصلاح handleScannedCheques في جميع الملفات
- ✅ `PolicyPaymentsSection.tsx` - إضافة صور للـ pendingImages
- ✅ `PackagePaymentModal.tsx` - إضافة صور للـ pendingImages
- ✅ `SinglePolicyPaymentModal.tsx` - إضافة صور للـ pendingImages
- ✅ `DebtPaymentModal.tsx` - إضافة صور للـ pendingImages
- ✅ `BrokerWallet.tsx` - حفظ CDN URL في cheque_image_url

---

## التدفق بعد الإصلاح

```
1. المستخدم يمسح صفحة فيها شيكات
              ↓
2. AI (gemini-2.5-pro) يكتشف الشيكات + bounding_box دقيق
              ↓
3. المتصفح يقص كل شيك من الصورة الأصلية (مع التحقق من الجودة)
              ↓
4. الصورة المقصوصة تُرفع فوراً لـ Bunny CDN
              ↓
5. عرض الشيكات مع الصور المقصوصة + CDN URLs
              ↓
6. النقر على "إضافة كدفعات"
              ↓
7. الدفعات تُنشأ مع صور في pendingImages
              ↓
8. الصور تظهر في قسم "صور الشيك" فوراً
```
