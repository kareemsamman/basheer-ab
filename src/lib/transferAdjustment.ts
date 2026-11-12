export function transferCashAmount(amount: number, collected: boolean): number {
  return collected && Number.isFinite(amount) && amount > 0 ? amount : 0;
}