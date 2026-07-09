/** Format integer minor units (pence/cents) as a currency string. */
export function formatMoney(cents: number, currency = "GBP"): string {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: (currency || "GBP").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${(currency || "GBP").toUpperCase()} ${amount.toFixed(0)}`;
  }
}
