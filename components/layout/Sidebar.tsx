"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Library,
  Menu,
  Settings,
  Shield,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation: {
  label: string;
  href: string | null;
  icon: LucideIcon;
  planned?: boolean;
  aliases?: string[];
}[] = [
  {
    label: "Calendar",
    href: "/calendar",
    aliases: ["/team-schedule"],
    icon: CalendarDays,
  },
  { label: "Sessions", href: "/sessions", icon: ClipboardList },
  { label: "Templates", href: "/templates", icon: ClipboardList },
  { label: "Exercise Library", href: "/exercises", icon: Library },
  { label: "Coaches", href: "/coaches", icon: Users },
  { label: "Tactics", href: "/lineup", icon: Workflow },
  {
    label: "Squad",
    href: "/roster",
    aliases: ["/player-profiles"],
    icon: Users,
    planned: true,
  },
  { label: "Settings", href: null, icon: Settings, planned: true },
];

/** Reuses one route/availability map for the desktop sidebar and mobile drawer. */
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-2 p-4">
      {navigation.map(({ label, href, icon: Icon, planned, aliases }) => {
        const active =
          href !== null &&
          [href, ...(aliases ?? [])].some(
            (route) => pathname === route || pathname.startsWith(`${route}/`),
          );
        const content = (
          <>
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {planned && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-shell-muted">
                Planned
              </span>
            )}
          </>
        );
        const className = cn(
          "flex min-h-12 items-center gap-3 rounded px-3 py-3 text-body-md",
          active ? "bg-shell-active text-shell-accent" : "text-shell-text",
          href &&
            "transition-colors hover:bg-shell-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shell-accent",
        );
        return href ? (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={className}
            onClick={onNavigate}
          >
            {content}
          </Link>
        ) : (
          <span
            key={label}
            aria-disabled="true"
            className={cn(className, "opacity-70")}
          >
            {content}
          </span>
        );
      })}
    </nav>
  );
}

/** Provides persistent desktop branding and global navigation, separate from pitch tools. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col border-r border-shell-edge bg-shell lg:flex">
      <div className="flex items-center gap-3 border-b border-shell-edge px-6 py-6">
        <Shield
          className="size-9 shrink-0 text-shell-accent"
          aria-hidden="true"
        />
        <div className="font-display text-headline-sm leading-tight text-shell-text">
          FOOTBALL
          <br />
          FORMATION
        </div>
      </div>
      <p className="px-6 pt-6 font-mono text-label-caps uppercase tracking-widest text-shell-muted">
        Coaching workspace
      </p>
      <Navigation />
      <p className="mt-auto px-6 pb-6 text-body-md text-shell-muted">
        Plan. Prepare. Coach.
      </p>
    </aside>
  );
}

/** Uses the shared Sheet primitive for modal focus management and closes on navigation. */
export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              className="text-shell-text hover:bg-shell-panel hover:text-shell-text"
            />
          }
        >
          <Menu aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="overflow-y-auto border-shell-edge bg-shell text-shell-text"
        >
          <SheetHeader>
            <SheetTitle className="pr-8 text-shell-text">
              Football Formation
            </SheetTitle>
            <SheetDescription className="text-shell-muted">
              Coaching workspace navigation. Planned features are labelled.
            </SheetDescription>
          </SheetHeader>
          <Navigation onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
