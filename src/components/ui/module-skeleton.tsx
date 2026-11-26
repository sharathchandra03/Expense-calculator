/**
 * A lightweight skeleton shown while a dynamically-imported module chunk is
 * loading. Keeps the screen non-blank so users see something immediately.
 */
export function ModuleSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-6 pb-8 animate-pulse">
      {/* Page title */}
      <div className="h-7 w-36 rounded-xl bg-secondary" />
      {/* Two stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 rounded-[1.4rem] bg-secondary" />
        <div className="h-24 rounded-[1.4rem] bg-secondary" />
      </div>
      {/* A tall card */}
      <div className="h-40 rounded-[1.6rem] bg-secondary" />
      {/* Three list rows */}
      {[0, 1, 2].map(i => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-secondary" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded-full bg-secondary" />
            <div className="h-2.5 w-1/2 rounded-full bg-secondary" />
          </div>
          <div className="h-4 w-16 flex-shrink-0 rounded-full bg-secondary" />
        </div>
      ))}
    </div>
  )
}
