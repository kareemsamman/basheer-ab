export interface ReceiptPrintData {
  receiptNumber: string;
  receiptType: string;
  receiptTypeLabel: string;
  clientName: string;
  carNumber: string;
  receiptDate: string;
  amount: number;
  accidentDate: string;
  accidentDetails: string;
  notes: string;
  source: string;
  paymentMethod?: string;
  chequeNumber?: string;
  chequeDate?: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'מזומן',
  cheque: 'שיק',
  visa: 'כרטיס אשראי',
  credit_card: 'כרטיס אשראי',
  transfer: 'העברה בנקאית',
  bank_transfer: 'העברה בנקאית',
  accident_fee: 'דמי תאונות',
};

export interface CompanySettings {
  logoUrl: string;
  company_email: string;
  company_location: string;
  company_phone_links: { phone: string; href: string }[];
}

function formatDateHe(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTimeHe(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function buildReceiptPrintHtml(data: ReceiptPrintData, settings: CompanySettings): string {
  const phoneLinksHtml = (settings.company_phone_links || []).map(
    (link) => `<span>${link.phone}</span>`
  ).join(' | ');

  const logoImg = settings.logoUrl
    ? `<img src="${settings.logoUrl}" alt="Logo" class="logo" />`
    : `<div class="logo-placeholder">AB</div>`;

  const accidentRows = data.receiptType === 'accident_fee' ? `
    <tr>
      <td>2</td>
      <td>תאריך תאונה</td>
      <td>${data.accidentDate ? formatDateHe(data.accidentDate) : '-'}</td>
      <td>-</td>
      <td class="amount-cell">-</td>
    </tr>
    ${data.accidentDetails ? `<tr>
      <td>3</td>
      <td>פרטי תאונה</td>
      <td colspan="2">${data.accidentDetails}</td>
      <td class="amount-cell">-</td>
    </tr>` : ''}
  ` : '';

  const sourceLabel = data.source === 'auto' ? 'אוטומטי' : 'ידני';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.receiptTypeLabel} ${data.receiptNumber} - ${data.clientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 15mm; }
    @media print {
      body { padding: 0; background: white; }
      .no-print { display: none !important; }
      .container { box-shadow: none; border: none; }
    }
    body {
      font-family: Arial, Tahoma, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1a1a;
      background: #f0f2f5;
      padding: 20px;
      direction: rtl;
    }
    .container {
      max-width: 794px;
      margin: 0 auto;
      background: white;
      border: 2px solid #1a3a5c;
      min-height: 600px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 30px;
      border-bottom: 3px solid #1a3a5c;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .logo { height: 70px; width: auto; object-fit: contain; }
    .logo-placeholder {
      width: 70px; height: 70px; background: #1a3a5c; color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: bold; border-radius: 8px;
    }
    .company-info { text-align: right; }
    .company-name { font-size: 22px; font-weight: bold; color: #1a3a5c; }
    .company-name-en { font-size: 11px; color: #666; letter-spacing: 1px; }
    .company-detail { font-size: 12px; color: #444; margin-top: 2px; }
    .header-left { text-align: left; font-size: 12px; color: #444; }
    .header-left div { margin-bottom: 2px; }

    .receipt-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 30px;
      border-bottom: 1px solid #ddd;
    }
    .receipt-title-block {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .receipt-label {
      font-size: 22px;
      font-weight: bold;
      color: #1a3a5c;
    }
    .receipt-num {
      font-size: 18px;
      font-weight: bold;
      color: #c0392b;
    }
    .receipt-origin {
      background: #e8f0fe;
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: bold;
      color: #1a3a5c;
    }

    .client-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 30px;
      border-bottom: 1px solid #ddd;
      font-size: 14px;
    }
    .client-name { font-weight: bold; }

    .subject-bar {
      background: #d6e4f0;
      padding: 10px 30px;
      font-weight: bold;
      font-size: 15px;
      color: #1a3a5c;
      border-bottom: 1px solid #b0c4d8;
    }

    .table-section { padding: 20px 30px; }
    .table-header-label {
      background: #1a3a5c;
      color: white;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      display: inline-block;
      border-radius: 4px 4px 0 0;
      margin-bottom: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #ccc;
    }
    th {
      background: #e8eef4;
      color: #1a3a5c;
      font-weight: bold;
      padding: 10px 12px;
      font-size: 13px;
      border: 1px solid #ccc;
      text-align: center;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #ccc;
      text-align: center;
      font-size: 13px;
    }
    .amount-cell { font-weight: bold; }

    .total-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 15px 30px;
      gap: 15px;
    }
    .total-label {
      font-size: 16px;
      font-weight: bold;
      color: #1a3a5c;
    }
    .total-value {
      background: #1a3a5c;
      color: white;
      padding: 8px 24px;
      border-radius: 6px;
      font-size: 20px;
      font-weight: bold;
    }

    .signature-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 30px 30px 20px;
      margin-top: 20px;
    }
    .signature-stamp { text-align: center; }
    .stamp-img { height: 60px; width: auto; opacity: 0.7; }
    .signature-line {
      width: 200px;
      border-top: 1px solid #999;
      padding-top: 5px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }

    .footer {
      border-top: 2px solid #1a3a5c;
      padding: 12px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #888;
      background: #fafafa;
    }
    .footer-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #1a3a5c;
      font-weight: bold;
      font-size: 11px;
    }

    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      padding: 20px;
    }
    .btn {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
      font-family: Arial, Tahoma, sans-serif;
    }
    .btn-print { background: #1a3a5c; color: white; }
    .btn-copy { background: #3b82f6; color: white; }
    .btn:hover { opacity: 0.9; }

    @media (max-width: 600px) {
      .header { flex-direction: column; text-align: center; gap: 10px; }
      .header-right { flex-direction: column; }
      .header-left { text-align: center; }
      .receipt-meta { flex-direction: column; gap: 8px; text-align: center; }
      .client-row { flex-direction: column; gap: 4px; }
      .total-row { justify-content: center; }
      .signature-section { flex-direction: column; align-items: center; gap: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-right">
        ${logoImg}
        <div class="company-info">
          <div class="company-name">בשיר אבו סנינה לביטוח</div>
          <div class="company-name-en">BASHEER ABU SNEINEH INSURANCE</div>
          <div class="company-detail">עוסק מורשה: 212426498</div>
        </div>
      </div>
      <div class="header-left">
        ${settings.company_location ? `<div>📍 ${settings.company_location}</div>` : ''}
        ${phoneLinksHtml ? `<div>📞 ${phoneLinksHtml}</div>` : ''}
        ${settings.company_email ? `<div>📧 ${settings.company_email}</div>` : ''}
      </div>
    </div>

    <div class="receipt-meta">
      <div class="receipt-title-block">
        <span class="receipt-label">${data.receiptTypeLabel}</span>
        <span class="receipt-num">#${data.receiptNumber}</span>
      </div>
      <span class="receipt-origin">${sourceLabel}</span>
    </div>

    <div class="client-row">
      <div><span>לכבוד: </span><span class="client-name">${data.clientName}</span></div>
      <div>תאריך: ${formatDateHe(data.receiptDate)}</div>
    </div>

    <div class="subject-bar">
      ביטוח רכב${data.carNumber ? ` / רכב ${data.carNumber}` : ''} / ${data.clientName}
    </div>

    <div class="table-section">
      <div class="table-header-label">פרטי תשלומים</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>אמצעי תשלום</th>
            <th>פירוט</th>
            <th>תאריך</th>
            <th>סכום</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>${data.receiptType === 'accident_fee' ? 'דמי תאונות' : 'תשלום'}</td>
            <td>${data.notes || '-'}</td>
            <td>${formatDateHe(data.receiptDate)}</td>
            <td class="amount-cell">₪${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          ${accidentRows}
        </tbody>
      </table>
    </div>

    <div class="total-row">
      <span class="total-label">סה"כ</span>
      <span class="total-value">₪${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>

    <div class="signature-section">
      <div class="signature-stamp">
        ${settings.logoUrl ? `<img src="${settings.logoUrl}" alt="Stamp" class="stamp-img" />` : ''}
      </div>
      <div class="signature-line">:חתימה</div>
    </div>

    <div class="footer">
      <div class="footer-badge">🔒 חתימה דיגיטלית מאובטחת</div>
      <div>הופק ב ${formatDateTimeHe(new Date().toISOString())} | ${data.receiptTypeLabel} ${data.receiptNumber}</div>
    </div>
  </div>

  <div class="action-buttons no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ הדפסה</button>
    <button class="btn btn-copy" onclick="copyLink()">🔗 העתק קישור</button>
  </div>

  <script>
    function copyLink() {
      var url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function() {
          alert('הקישור הועתק');
        });
      } else {
        prompt('העתק קישור:', url);
      }
    }
    setTimeout(function(){ window.print(); }, 500);
  </script>
</body>
</html>`;
}
