"use client";

export default function OpenThesisButton({
  symbol,
  onOpen,
}: {
  symbol: string;
  onOpen: (symbol: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(symbol);
      }}
      className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-blue-300 transition hover:border-blue-500/40 hover:text-blue-200"
    >
      Thesis
    </button>
  );
}
