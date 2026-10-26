"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNavigation } from "./Sidebar";

/** Shows route context and available tactics tools without advertising planned tools as links. */
export function Header() {
  const pathname = usePathname();
  const tactics = pathname === "/lineup";
  const workspace = tactics
    ? "Tactics"
    : ["/calendar", "/team-schedule"].includes(pathname)
      ? "Calendar"
      : ["/roster", "/player-profiles"].includes(pathname)
        ? "Squad"
        : "Coaching workspace";
  return (
    <header className="border-b border-shell-edge bg-shell text-shell-text">
      <div className="flex min-h-header items-center gap-3 px-4 md:px-8">
        <MobileNavigation />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-shell-muted">
            Football Formation
          </p>
          <p className="font-display text-headline-md">{workspace}</p>
        </div>
        <span className="ml-auto hidden rounded border border-shell-edge px-3 py-1 font-mono text-label-caps text-shell-muted sm:inline">
          2D coaching platform
        </span>
      </div>
      {tactics && (
        <nav
          aria-label="Tactics workspaces"
          className="flex flex-wrap items-center gap-1 px-4 md:px-8"
        >
          <Link
            href="/lineup"
            aria-current="page"
            className="border-b-2 border-shell-accent px-3 py-3 text-body-md font-semibold text-shell-accent focus-visible:outline-2 focus-visible:outline-shell-accent"
          >
            Lineups
          </Link>
          {["2D Editor", "2D Presentation"].map((label) => (
            <span
              key={label}
              aria-disabled="true"
              className="flex items-center gap-2 px-3 py-3 text-body-md text-shell-muted"
            >
              {label}
              <span className="font-mono text-[10px] uppercase">Planned</span>
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}
