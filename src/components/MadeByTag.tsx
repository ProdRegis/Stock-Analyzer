/**
 * Persistent signature, pinned to the corner on every screen.
 *
 * Deliberately click-through: it sits above the page on small viewports, and a
 * credit that swallows taps on whatever is underneath would be worse than no
 * credit at all.
 */
export default function MadeByTag() {
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 select-none">
      <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950/85 px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-500 shadow-lg backdrop-blur-sm">
        <span
          className="h-1.5 w-1.5 rounded-full bg-blue-500"
          aria-hidden="true"
        />
        Made by <span className="text-slate-200">Regis</span>
      </span>
    </div>
  );
}
