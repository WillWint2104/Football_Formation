"use client";

import { useLayoutEffect } from "react";
import { installLocalHistoryGuard } from "@/lib/designer/local-history-guard";

/** Root lifetime, no rendered UI. A local editor supplies a guard only while it is dirty. */
export function LocalHistoryGuard() {
  useLayoutEffect(installLocalHistoryGuard, []);
  return null;
}
