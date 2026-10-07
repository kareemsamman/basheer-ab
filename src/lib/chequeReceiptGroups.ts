import { getEffectiveChequeStatus } from '@/lib/chequeUtils';

export interface ChequePaymentRow {
  id: string;
  amount: number;
  payment_date: string; // the cheque's due date
  cheque_number: string | null;
  cheque_image_url: string | null;
  cheque_status: string | null;
  refused: boolean | null;
  locked: boolean | null;
  policy_id: string;
  batch_id: string | null;
  created_at: string;
  policy: { policy_type_parent: string } | null;
}

// One physical cheque. A cheque split across policies is stored as several
// rows sharing batch_id, cheque_number and payment_date.
export interface ChequeItem<T extends ChequePaymentRow = ChequePaymentRow> {
  key: string;
  cheque_number: string | null;
  due_date: string;
  amount: number;
  cheque_status: string | null;
  refused: boolean;
  locked: boolean;
  cheque_image_url: string | null;
  payments: T[];
  policyTypes: string[];
}

// All cheques received from the client on the same day
export interface ChequeReceiptGroup<T extends ChequePaymentRow = ChequePaymentRow> {
  kind: 'cheques';
  id: string;
  received_date: string | null; // null when imported from the old system
  sort_date: string;
  totalAmount: number;
  cheques: ChequeItem<T>[];
  payments: T[];
}

export type ChequeStateKey = 'due' | 'pending' | 'returned' | 'transferred' | 'cancelled';

export interface ChequeState {
  key: ChequeStateKey;
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'secondary';
}

const CHEQUE_STATE_ORDER: ChequeStateKey[] = ['due', 'pending', 'returned', 'transferred', 'cancelled'];

// Cheques imported from the old system were all created in one run on
// 18/01/2026, so their created_at is not the day they were received.
const LEGACY_IMPORT_LAST_DAY = '2026-01-18';

const israelDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });

/** YYYY-MM-DD of a timestamp in Israel time */
export const toIsraelDay = (timestamp: string) => israelDayFormatter.format(new Date(timestamp));

export function getChequeState(cheque: Pick<ChequeItem, 'refused' | 'cheque_status' | 'due_date'>): ChequeState {
  if (cheque.refused || cheque.cheque_status === 'returned') return { key: 'returned', label: 'راجع', variant: 'destructive' };
  if (cheque.cheque_status === 'cancelled') return { key: 'cancelled', label: 'ملغي', variant: 'secondary' };
  if (cheque.cheque_status === 'transferred_out') return { key: 'transferred', label: 'محوّل', variant: 'secondary' };
  return getEffectiveChequeStatus(cheque.due_date, cheque.cheque_status) === 'cashed'
    ? { key: 'due', label: 'تم الاستحقاق', variant: 'success' }
    : { key: 'pending', label: 'لم يستحق بعد', variant: 'warning' };
}

/** Count and total of a group's cheques per state, in display order */
export function summarizeChequeStates(cheques: ChequeItem[]) {
  const summary: (ChequeState & { count: number; amount: number })[] = [];
  for (const cheque of cheques) {
    const state = getChequeState(cheque);
    const entry = summary.find(s => s.key === state.key);
    if (entry) {
      entry.count += 1;
      entry.amount += cheque.amount;
    } else {
      summary.push({ ...state, count: 1, amount: cheque.amount });
    }
  }
  return summary.sort((a, b) => CHEQUE_STATE_ORDER.indexOf(a.key) - CHEQUE_STATE_ORDER.indexOf(b.key));
}

/**
 * Groups a client's cheque payments by the day they were received (the day
 * they were entered), merging split rows back into physical cheques.
 * Imported cheques have no receipt date, so each policy's cheques stay together.
 */
export function groupChequesByReceipt<T extends ChequePaymentRow>(payments: T[]): ChequeReceiptGroup<T>[] {
  const groups = new Map<string, ChequeReceiptGroup<T>>();

  for (const payment of payments) {
    const createdDay = toIsraelDay(payment.created_at);
    const isLegacy = createdDay <= LEGACY_IMPORT_LAST_DAY;
    const groupKey = isLegacy ? `legacy:${payment.policy_id}` : `received:${createdDay}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        kind: 'cheques',
        id: groupKey,
        received_date: isLegacy ? null : createdDay,
        sort_date: isLegacy ? payment.payment_date : createdDay,
        totalAmount: 0,
        cheques: [],
        payments: [],
      });
    }
    const group = groups.get(groupKey)!;
    group.payments.push(payment);
    group.totalAmount += payment.amount;
    if (isLegacy && payment.payment_date < group.sort_date) {
      group.sort_date = payment.payment_date;
    }

    const chequeKey = payment.batch_id
      ? `${payment.batch_id}|${payment.cheque_number ?? ''}|${payment.payment_date}`
      : payment.id;
    let cheque = group.cheques.find(c => c.key === chequeKey);
    if (!cheque) {
      cheque = {
        key: chequeKey,
        cheque_number: payment.cheque_number,
        due_date: payment.payment_date,
        amount: 0,
        cheque_status: payment.cheque_status,
        refused: false,
        locked: false,
        cheque_image_url: payment.cheque_image_url,
        payments: [],
        policyTypes: [],
      };
      group.cheques.push(cheque);
    }
    cheque.payments.push(payment);
    cheque.amount += payment.amount;
    if (payment.refused) cheque.refused = true;
    if (payment.locked) cheque.locked = true;
    if (payment.cheque_status === 'returned') cheque.cheque_status = 'returned';
    if (!cheque.cheque_image_url && payment.cheque_image_url) cheque.cheque_image_url = payment.cheque_image_url;
    const policyType = payment.policy?.policy_type_parent;
    if (policyType && !cheque.policyTypes.includes(policyType)) {
      cheque.policyTypes.push(policyType);
    }
  }

  for (const group of groups.values()) {
    group.cheques.sort((a, b) => a.due_date.localeCompare(b.due_date));
  }
  return Array.from(groups.values());
}
