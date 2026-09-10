export function formatMarketState(state: string): string {
  const labels: Record<string, string> = {
    REGULAR: "Market Open",
    CLOSED: "Market Closed",
    PRE: "Pre-Market",
    PREPRE: "Pre-Market",
    POST: "After Hours",
    POSTPOST: "After Hours",
  };
  return labels[state] ?? state;
}
