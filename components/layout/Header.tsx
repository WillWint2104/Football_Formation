import { BarChart3, Bell, Search } from "lucide-react";

export function Header() {
  return (
    <header className="h-header shrink-0 flex items-center gap-6 px-6 border-b border-outline-variant bg-surface-container-lowest">
      <h1 className="font-display text-headline-md text-on-surface whitespace-nowrap">
        Command &amp; Control
      </h1>

      <div className="flex-1 max-w-xl relative">
        <Search
          className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="global-search">
          Search
        </label>
        <input
          id="global-search"
          type="search"
          placeholder="Search players, matches…"
          className="w-full bg-surface-container border border-outline-variant rounded-lg pl-9 pr-3 py-2 text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="p-2 rounded hover:bg-surface-container-high transition-colors"
        >
          <Bell className="size-5 text-on-surface-variant" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Analytics"
          className="p-2 rounded hover:bg-surface-container-high transition-colors"
        >
          <BarChart3
            className="size-5 text-on-surface-variant"
            aria-hidden="true"
          />
        </button>
        <div
          aria-label="User avatar"
          className="ml-2 size-9 rounded-full bg-primary text-on-primary font-mono text-body-md inline-flex items-center justify-center"
        >
          WW
        </div>
      </div>
    </header>
  );
}
