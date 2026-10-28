"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileNavigation } from "./Sidebar";

const workspaceLabels: Record<string, string> = {
  "/sessions": "Sessions", "/templates": "Session templates",
  "/exercises": "Exercise library", "/coaches": "Coach directory",
  "/guides": "Coaching guide",
  "/presentations": "Coaching presentations",
};

/** Shows route context and available tactics tools without advertising planned tools as links. */
export function Header() {
  const pathname = usePathname();
  const tactics = ["/lineup", "/tactical-renderer", "/tactical-editor"].includes(pathname);
  const workspace = tactics
    ? "Tactics"
    : ["/calendar", "/team-schedule"].includes(pathname)
      ? "Calendar"
      : ["/sessions", "/templates", "/exercises", "/coaches", "/guides", "/presentations"].includes(pathname)
        ? workspaceLabels[pathname]
      : ["/roster", "/player-profiles"].includes(pathname)
        ? "Squad"
        : "Coaching workspace";
  return (
    <header className="border-b border-shell-edge bg-shell text-shell-text">
      <div className={`flex ${pathname === "/tactical-editor" ? "min-h-[48px]" : "min-h-header"} items-center gap-3 px-4 md:px-8`}>
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
            aria-current={pathname === "/lineup" ? "page" : undefined}
            className={`border-b-2 px-3 py-3 text-body-md font-semibold focus-visible:outline-2 focus-visible:outline-shell-accent ${pathname === "/lineup" ? "border-shell-accent text-shell-accent" : "border-transparent text-shell-text"}`}
          >
            Lineups
          </Link>
          <Link href="/tactical-renderer" aria-current={pathname === "/tactical-renderer" ? "page" : undefined} className={`border-b-2 px-3 py-3 text-body-md font-semibold focus-visible:outline-2 focus-visible:outline-shell-accent ${pathname === "/tactical-renderer" ? "border-shell-accent text-shell-accent" : "border-transparent text-shell-text"}`}>Renderer preview</Link>
          <Link href="/tactical-editor" aria-current={pathname === "/tactical-editor" ? "page" : undefined} className={`border-b-2 px-3 py-3 text-body-md font-semibold focus-visible:outline-2 focus-visible:outline-shell-accent ${pathname === "/tactical-editor" ? "border-shell-accent text-shell-accent" : "border-transparent text-shell-text"}`}>2D Editor</Link>
          <Link href="/presentations" className="px-3 py-3 text-body-md text-shell-text focus-visible:outline-2 focus-visible:outline-shell-accent">2D Presentation</Link>
        </nav>
      )}
    </header>
  );
}
