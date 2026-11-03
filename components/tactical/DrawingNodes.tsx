import { createElement } from "react";
import type { SvgNode } from "@/lib/tactical/drawing";

/** Shared React adapter for the existing drawing tree. Text remains escaped React content. */
export function renderDrawingNode(n: SvgNode, key: number): React.ReactNode {
  return createElement(n.tag, { ...n.attrs, key }, n.text ?? n.children?.map(renderDrawingNode));
}
