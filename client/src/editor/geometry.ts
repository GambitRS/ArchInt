import type { Element } from "../diagram";

export type ResizeHandle = "nw" | "ne" | "se" | "sw";
export type Bounds = { x: number; y: number; w: number; h: number };
export type SnapGuide = { axis: "x" | "y"; position: number };

export function isResizeHandle(
  value: string | null | undefined,
): value is ResizeHandle {
  return value === "nw" || value === "ne" || value === "se" || value === "sw";
}

export function resizeElement(
  element: Element,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minSize = 24,
  preserveAspect = false,
): Element {
  if (element.kind === "arrow" || element.kind === "pen") return element;

  const angle = -((element.rotation || 0) * Math.PI) / 180;
  const localDeltaX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle);
  const localDeltaY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle);
  const right = element.x + element.w;
  const bottom = element.y + element.h;
  let x = element.x;
  let y = element.y;
  const rawW = handle.includes("w")
    ? element.w - localDeltaX
    : element.w + localDeltaX;
  const rawH = handle.includes("n")
    ? element.h - localDeltaY
    : element.h + localDeltaY;
  let w = Math.max(minSize, rawW);
  let h = Math.max(minSize, rawH);

  if (preserveAspect && element.w > 0 && element.h > 0) {
    const widthScale = rawW / element.w;
    const heightScale = rawH / element.h;
    const scale = Math.max(
      minSize / element.w,
      minSize / element.h,
      Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
        ? widthScale
        : heightScale,
    );
    w = element.w * scale;
    h = element.h * scale;
  }

  if (handle.includes("w")) {
    x = right - w;
  }

  if (handle.includes("n")) {
    y = bottom - h;
  }

  return { ...element, x, y, w, h };
}

export function translateElement(
  element: Element,
  deltaX: number,
  deltaY: number,
): Element {
  return { ...element, x: element.x + deltaX, y: element.y + deltaY };
}

function rotatePoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  angle: number,
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

export function elementBounds(element: Element): Bounds {
  if (element.kind === "pen") {
    const points = (element.points || []).map(([x, y]) => ({
      x: element.x + x,
      y: element.y + y,
    }));
    if (points.length) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }
    return { x: element.x, y: element.y, w: 0, h: 0 };
  }

  const localPoints =
    element.kind === "arrow"
      ? [
          { x: 0, y: 0 },
          { x: element.w, y: element.h },
        ]
      : [
          { x: 0, y: 0 },
          { x: element.w, y: 0 },
          { x: element.w, y: element.h },
          { x: 0, y: element.h },
        ];
  const centerX = element.w / 2;
  const centerY = element.h / 2;
  const angle = ((element.rotation || 0) * Math.PI) / 180;
  const points = localPoints.map((point) => {
    const rotated = angle
      ? rotatePoint(point.x, point.y, centerX, centerY, angle)
      : point;
    return { x: element.x + rotated.x, y: element.y + rotated.y };
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function boundsForElements(
  elements: Element[],
  ids?: Iterable<string>,
): Bounds | null {
  const wanted = ids ? new Set(ids) : null;
  const bounds = elements
    .filter((element) => !wanted || wanted.has(element.id))
    .map(elementBounds);
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.w));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

export function rotateElement(element: Element, degrees: number): Element {
  const rotation = ((element.rotation || 0) + degrees) % 360;
  return {
    ...element,
    rotation:
      rotation > 180 ? rotation - 360 : rotation < -180 ? rotation + 360 : rotation,
  };
}

export function snapTranslation(
  elements: Element[],
  movingIds: Iterable<string>,
  deltaX: number,
  deltaY: number,
  threshold = 8,
): { deltaX: number; deltaY: number; guides: SnapGuide[] } {
  const moving = boundsForElements(elements, movingIds);
  if (!moving) return { deltaX, deltaY, guides: [] };
  const movingSet = new Set(movingIds);
  const others = elements
    .filter((element) => !movingSet.has(element.id) && !element.hidden)
    .map(elementBounds);
  const xAnchors = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const yAnchors = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const xTargets = others.flatMap((bound) => [
    bound.x,
    bound.x + bound.w / 2,
    bound.x + bound.w,
  ]);
  const yTargets = others.flatMap((bound) => [
    bound.y,
    bound.y + bound.h / 2,
    bound.y + bound.h,
  ]);
  let xAdjustment = 0;
  let yAdjustment = 0;
  let xGuide: number | undefined;
  let yGuide: number | undefined;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
  for (const anchor of xAnchors) {
    for (const target of xTargets) {
      const adjustment = target - (anchor + deltaX);
      if (Math.abs(adjustment) < Math.abs(bestX)) {
        bestX = adjustment;
        xAdjustment = adjustment;
        xGuide = target;
      }
    }
  }
  for (const anchor of yAnchors) {
    for (const target of yTargets) {
      const adjustment = target - (anchor + deltaY);
      if (Math.abs(adjustment) < Math.abs(bestY)) {
        bestY = adjustment;
        yAdjustment = adjustment;
        yGuide = target;
      }
    }
  }
  return {
    deltaX: deltaX + (Math.abs(xAdjustment) <= threshold ? xAdjustment : 0),
    deltaY: deltaY + (Math.abs(yAdjustment) <= threshold ? yAdjustment : 0),
    guides: [
      ...(Math.abs(xAdjustment) <= threshold && xGuide !== undefined
        ? [{ axis: "x" as const, position: xGuide }]
        : []),
      ...(Math.abs(yAdjustment) <= threshold && yGuide !== undefined
        ? [{ axis: "y" as const, position: yGuide }]
        : []),
    ],
  };
}

function distanceToSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx && !dy) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

export function eraseAtPoint(
  elements: Element[],
  x: number,
  y: number,
  radius = 14,
): Element[] {
  return elements.filter((element) => {
    if (element.kind !== "pen" || element.hidden) return true;
    const points = (element.points || []).map(
      ([px, py]) => [element.x + px, element.y + py] as [number, number],
    );
    if (!points.length) return true;
    if (points.some(([px, py]) => Math.hypot(x - px, y - py) <= radius)) return false;
    return !points.some(
      ([ax, ay], index) =>
        index > 0 &&
        distanceToSegment(
          x,
          y,
          ax,
          ay,
          points[index - 1][0],
          points[index - 1][1],
        ) <= radius,
    );
  });
}
