import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface GlassTabItem<T extends string> {
  id: T;
  label: string;
}

interface GlassTabsProps<T extends string> {
  items: ReadonlyArray<GlassTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

interface LensRect {
  x: number;
  w: number;
}

/**
 * Draggable Liquid Glass Tabs with smooth Apple exponential deceleration,
 * single-pointer isolation, interrupted-gesture recovery, and keyboard ← / → nav.
 */
export function GlassTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = "主导航",
}: GlassTabsProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rectsRef = useRef<LensRect[]>([]);

  const dragRef = useRef({
    activePointerId: null as number | null,
    dragMoved: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOffset: 0,
    currentX: 4,
    currentW: 66,
    lastX: 0,
    lastTime: 0,
  });

  const activeIdx = Math.max(0, items.findIndex((item) => item.id === value));
  const [lens, setLens] = useState<{ x: number; w: number; scaleX: number; scaleY: number; ready: boolean }>({
    x: 4,
    w: 66,
    scaleX: 1,
    scaleY: 1,
    ready: false,
  });
  const [dragging, setDragging] = useState(false);

  const measure = useCallback((): LensRect[] => {
    const track = trackRef.current;
    if (!track) return rectsRef.current;
    const measured: LensRect[] = items.map((_, i) => {
      const btn = btnRefs.current[i];
      if (!btn) return { x: 4, w: 66 };
      return { x: btn.offsetLeft, w: btn.offsetWidth || 66 };
    });
    rectsRef.current = measured;
    return measured;
  }, [items]);

  const snapToActive = useCallback(() => {
    const measured = measure();
    const target = measured[activeIdx];
    if (target) {
      setLens({ x: target.x, w: target.w, scaleX: 1, scaleY: 1, ready: true });
    }
  }, [activeIdx, measure]);

  useLayoutEffect(() => {
    if (!dragRef.current.dragMoved) {
      snapToActive();
    }
  }, [snapToActive]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!dragRef.current.dragMoved) {
        snapToActive();
      }
    });
    if (trackRef.current) ro.observe(trackRef.current);

    // Clear interrupted drag state if the browser window blurs mid-drag
    const onWindowBlur = () => {
      const d = dragRef.current;
      if (d.activePointerId !== null) {
        d.activePointerId = null;
        d.dragMoved = false;
        setDragging(false);
        snapToActive();
      }
    };
    window.addEventListener("blur", onWindowBlur);
    return () => {
      ro.disconnect();
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [snapToActive]);

  const findNearestIndex = (centerX: number): number => {
    let best = 0;
    let bestDist = Infinity;
    rectsRef.current.forEach((r, idx) => {
      const d = Math.abs(r.x + r.w / 2 - centerX);
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    });
    return best;
  };

  const commitIndex = useCallback(
    (idx: number) => {
      const measured = measure();
      const target = measured[idx];
      if (target) {
        setLens({ x: target.x, w: target.w, scaleX: 1, scaleY: 1, ready: true });
      }
      const nextItem = items[idx];
      if (nextItem) onChange(nextItem.id);
    },
    [items, measure, onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    // Ignore secondary touches while an active drag is already in progress
    if (d.activePointerId !== null) return;
    const track = trackRef.current;
    if (!track) return;
    measure();
    const tr = track.getBoundingClientRect();
    const localX = e.clientX - tr.left;

    d.activePointerId = e.pointerId;
    d.dragMoved = false;
    d.dragStartX = localX;
    d.dragStartY = e.clientY;
    d.lastX = localX;
    d.lastTime = performance.now();
    d.currentX = lens.x;
    d.currentW = lens.w;
    d.dragOffset = localX >= lens.x && localX <= lens.x + lens.w ? localX - lens.x : lens.w / 2;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const track = trackRef.current;
    if (d.activePointerId !== e.pointerId || !track) return;

    const tr = track.getBoundingClientRect();
    const localX = e.clientX - tr.left;
    const dx = Math.abs(localX - d.dragStartX);
    const dy = Math.abs(e.clientY - d.dragStartY);

    if (!d.dragMoved) {
      // Yield to vertical page scroll when vertical motion dominates
      if (dy > 10 && dy > dx) {
        d.activePointerId = null;
        return;
      }
      if (dx > 8) {
        d.dragMoved = true;
        setDragging(true);
        try {
          track.setPointerCapture(e.pointerId);
        } catch {
          // ignore if unsupported
        }
      }
    }
    if (!d.dragMoved) return;

    const now = performance.now();
    const dt = Math.max(8, now - d.lastTime);
    const velocity = Math.abs((localX - d.lastX) / dt) * 16;
    d.lastX = localX;
    d.lastTime = now;

    const maxX = Math.max(4, tr.width - d.currentW - 4);
    const clampedX = Math.max(4, Math.min(maxX, localX - d.dragOffset));
    const nearest = findNearestIndex(clampedX + d.currentW / 2);
    const nr = rectsRef.current[nearest];
    const nextW = nr ? nr.w : d.currentW;
    d.currentX = clampedX;
    d.currentW = nextW;
    const stretch = Math.min(0.12, velocity * 0.006);

    setLens({
      x: clampedX,
      w: nextW,
      scaleX: 1.02 + stretch,
      scaleY: 1.02 - stretch * 0.35,
      ready: true,
    });
  };

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = dragRef.current;
    const track = trackRef.current;
    if (d.activePointerId !== e.pointerId || !track) return;
    const wasDragging = d.dragMoved;
    const finalCenterX = d.currentX + d.currentW / 2;
    d.activePointerId = null;
    d.dragMoved = false;
    setDragging(false);
    try {
      if (track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    if (wasDragging) {
      if (cancelled) {
        snapToActive();
      } else {
        const nearest = findNearestIndex(finalCenterX);
        commitIndex(nearest);
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      commitIndex((activeIdx + 1) % items.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      commitIndex((activeIdx - 1 + items.length) % items.length);
    }
  };

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishPointer(e, false)}
      onPointerCancel={(e) => finishPointer(e, true)}
      onLostPointerCapture={(e) => finishPointer(e, true)}
      className={`glass-tabs-track relative flex h-12 select-none items-center rounded-full p-1 lg:h-11 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* Thick Liquid Glass Optical Lens Thumb with Smooth Exponential Deceleration */}
      <div
        aria-hidden="true"
        className="glass-lens pointer-events-none absolute top-1 bottom-1 left-0 rounded-full"
        style={{
          opacity: lens.ready ? 1 : 0,
          width: `${lens.w}px`,
          transform: `translate3d(${lens.x}px, 0, 0) scale(${lens.scaleX}, ${lens.scaleY})`,
          transition: dragging
            ? "width 120ms ease, transform 36ms linear"
            : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease",
        }}
      >
        <div className="glass-lens-sheen absolute inset-[1px] rounded-full" />
      </div>

      {items.map((item, idx) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            type="button"
            onClick={() => commitIndex(idx)}
            className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center rounded-full px-4 text-[13.5px] tracking-[-0.01em] transition-colors duration-200 lg:min-h-[36px] lg:flex-initial lg:px-5 lg:text-[13px] ${
              active
                ? "font-semibold text-[#111318]"
                : "font-medium text-[#4c515c] hover:text-[#1d1d1f]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
