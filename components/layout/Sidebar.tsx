"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  IdCard,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Settings,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Roster", href: "/roster", icon: Users },
  { label: "Lineup Builder", href: "/lineup", icon: LayoutGrid },
  { label: "Player Profiles", href: "/player-profiles", icon: IdCard },
  { label: "Team Schedule", href: "/team-schedule", icon: Calendar },
];

const bottomNav: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Support", href: "/support", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded px-3 py-3 text-body-md transition-colors",
          active
            ? "bg-secondary-container text-on-secondary-container font-semibold"
            : "text-on-tertiary-container hover:bg-tertiary-container hover:text-on-tertiary",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <aside className="w-sidebar shrink-0 bg-tertiary text-on-tertiary flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="font-display text-headline-md text-on-tertiary">
          ELITE TACTICAL
        </div>
        <div className="font-mono text-label-caps uppercase text-on-tertiary-container mt-1">
          Premier League Ops
        </div>
      </div>

      <nav className="px-3 flex flex-col gap-1" aria-label="Primary">
        {primaryNav.map(renderNavItem)}
      </nav>

      <div className="mt-auto flex flex-col gap-2 px-3 pb-4">
        <div className="px-3 pt-2 pb-3">
          <button
            type="button"
            className="w-full bg-primary text-on-primary rounded-lg py-3 px-4 font-display text-headline-sm hover:bg-primary-container transition-colors inline-flex items-center justify-center gap-2"
          >
            <Zap className="size-4" aria-hidden="true" />
            Quick Strategy
          </button>
        </div>
        <nav
          className="flex flex-col gap-1 pt-3 border-t border-outline-variant/20"
          aria-label="Secondary"
        >
          {bottomNav.map(renderNavItem)}
        </nav>
      </div>
    </aside>
  );
}
