/**
 * Builds an Arabic account-statement (كشف حساب مختصر) style HTML report
 * for the Accounting page export. Matches the classic ledger layout with
 * من تاريخ / إلى تاريخ, debit (عليه) / credit (له) columns and running balance.
 */

export interface StatementRow {
  date: string;
  movement: string;       // الحركة (e.g. مبيعات، سند قبض، سند صرف)
  description: string;    // البيان (client/company + details)
  debit: number;          // عليه
  credit: number;         // له
}

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-GB') : '-';

const fmtNum = (n: number) =>
  n === 0
    ? '0.00'
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildAccountingStatementHtml(opts: {
  rows: StatementRow[];
  fromDate: string;
  toDate: string;
  customerName: string;       // اسم الزبون
  customerCode?: string;      // كود
  region?: string;            // المنطقة
  phone?: string;             // الجوال
  openingBalance?: number;    // رصيد مدور (optional)
  title?: string;             // default: كشف حساب - مختصر
}): string {
  const {
    rows,
    fromDate,
    toDate,
    customerName,
    customerCode = '',
    region = '',
    phone = '',
    openingBalance = 0,
    title = 'كشف حساب - مختصر',
  } = opts;

  let running = openingBalance;
  const bodyRows = rows
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((r) => {
      // Sign convention: عليه (debit) increases what customer owes us -> negative balance
      // له (credit) decreases what customer owes us -> positive balance
      // Display balance as in image: negative values shown in parentheses
      running += r.credit - r.debit;
      const balDisplay =
        running < 0
          ? `(${fmtNum(Math.abs(running))})`
          : fmtNum(running);
      return `
        <tr>
          <td class="td-date">${fmtDate(r.date)}</td>
          <td class="td-bal ${running < 0 ? 'neg' : ''}">${balDisplay}</td>
          <td class="td-deb">${r.debit ? fmtNum(r.debit) : '0.00'}</td>
          <td class="td-cre">${r.credit ? fmtNum(r.credit) : '0.00'}</td>
          <td class="td-mov">${r.movement || '-'}</td>
          <td class="td-desc">${r.description || '-'}</td>
        </tr>`;
    })
    .join('');

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = openingBalance + totalCredit - totalDebit;
  const finalBalDisplay =
    finalBalance < 0
      ? `(${fmtNum(Math.abs(finalBalance))})`
      : fmtNum(finalBalance);

  // Arabic number-to-words is complex; show numeric label only.
  const balLabel =
    finalBalance < 0
      ? `رصيد مدور عليه ${fmtNum(Math.abs(finalBalance))}`
      : `رصيد مدور له ${fmtNum(finalBalance)}`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Arial', 'Tahoma', 'Noto Naskh Arabic', sans-serif;
    direction: rtl;
    color: #111;
    background: #fff;
    padding: 14px 18px;
    font-size: 12px;
  }
  .top-bar {
    background: #d9d9d9;
    padding: 6px 10px;
    font-weight: 700;
    font-size: 14px;
    border: 1px solid #888;
    margin-bottom: 8px;
    text-align: right;
  }
  .info-row {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    border: 1px solid #888;
    padding: 6px 10px;
    margin-bottom: 4px;
    font-size: 12px;
    align-items: center;
  }
  .info-row .cell { white-space: nowrap; }
  .info-row .cell b { font-weight: 700; }
  .info-row .box {
    border: 1px solid #888;
    padding: 2px 10px;
    background: #fff;
    font-weight: 700;
  }
  .balance-banner {
    border: 1px dashed #888;
    padding: 6px 10px;
    margin-bottom: 6px;
    font-weight: 700;
    text-align: center;
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }
  thead th {
    background: #efefef;
    border: 1px solid #555;
    padding: 6px 4px;
    font-size: 12px;
    font-weight: 700;
  }
  thead th.th-deb { color: #c00; }
  tbody td {
    border: 1px solid #888;
    padding: 5px 6px;
    font-size: 12px;
    vertical-align: middle;
  }
  .td-date { text-align: center; white-space: nowrap; width: 80px; }
  .td-bal  { text-align: center; white-space: nowrap; width: 110px; font-weight: 600; }
  .td-bal.neg { color: #000; }
  .td-deb  { text-align: center; width: 90px; color: #c00; font-weight: 600; }
  .td-cre  { text-align: center; width: 90px; }
  .td-mov  { text-align: center; width: 90px; }
  .td-desc { text-align: right; }
  tfoot td {
    border: 1px solid #555;
    background: #efefef;
    font-weight: 700;
    padding: 6px;
    text-align: center;
  }
  .footer {
    margin-top: 14px;
    text-align: center;
    font-size: 10px;
    color: #666;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <div class="top-bar">${title}</div>

  <div class="info-row">
    <div class="cell"><b>من تاريخ:</b> <span class="box">${fmtDate(fromDate)}</span></div>
    <div class="cell"><b>إلى تاريخ:</b> <span class="box">${fmtDate(toDate)}</span></div>
    <div class="cell" style="margin-right:auto;"><b>اسم الزبون:</b> <span class="box">${customerName}</span></div>
    ${customerCode ? `<div class="cell"><b>كود:</b> <span class="box">${customerCode}</span></div>` : ''}
  </div>

  <div class="info-row">
    ${phone ? `<div class="cell"><b>الجوال:</b> ${phone}</div>` : '<div class="cell">&nbsp;</div>'}
    ${region ? `<div class="cell" style="margin-right:auto;"><b>المنطقة:</b> ${region}</div>` : ''}
  </div>

  <div class="balance-banner">${balLabel}</div>

  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>الرصيد</th>
        <th class="th-deb">عليه</th>
        <th>له</th>
        <th>الحركة</th>
        <th>البيـــــــــــان</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="6" style="text-align:center;padding:20px;">لا توجد بيانات</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">الإجمالي</td>
        <td style="color:#c00;">${fmtNum(totalDebit)}</td>
        <td>${fmtNum(totalCredit)}</td>
        <td colspan="2">الرصيد النهائي: ${finalBalDisplay}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">AB Insurance CRM &bull; تم الإنشاء تلقائياً &bull; ${new Date().toLocaleString('en-GB')}</div>
</body>
</html>`;
}

export function openAccountingStatementPrint(html: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة / Please allow popups');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onafterprint = () => w.close();
  w.onload = () => setTimeout(() => w.print(), 400);
}
