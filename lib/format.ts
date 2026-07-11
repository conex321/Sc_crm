// House currency is CAD (QuickBooks). Per-row currencies format in their own
// currency; locale follows currency (matches pipeline-board behavior).
export function fmtMoney(amount: number, currency = "CAD"): string {
  const locale = currency === "USD" ? "en-US" : "en-CA";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const fmtCad = (n: number) => fmtMoney(n, "CAD");
