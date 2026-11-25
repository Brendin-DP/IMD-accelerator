"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Ring chart with a headline in the middle and a legend beside it. Hovering a
 * segment or legend row highlights it and shows its share in the centre.
 */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 16,
  emptyLabel = "No data yet",
}: {
  segments: DonutSegment[];
  centerValue: React.ReactNode;
  centerLabel: string;
  size?: number;
  thickness?: number;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = segments.map((s, i) => {
    const len = total ? (s.value / total) * c : 0;
    const arc = { i, s, dash: Math.max(0, len - gap), offset };
    offset += len;
    return arc;
  });

  const hovered = active !== null ? segments[active] : null;

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {total > 0 &&
            arcs.map(({ i, s, dash, offset: o }) =>
              s.value > 0 ? (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === i ? thickness + 4 : thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-o}
                  className="cursor-pointer transition-all duration-200"
                  style={{ opacity: active === null || active === i ? 1 : 0.35 }}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </circle>
              ) : null,
            )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {total === 0 ? (
            <span className="px-4 text-xs text-gray-400">{emptyLabel}</span>
          ) : hovered ? (
            <>
              <span className="text-2xl font-semibold tabular-nums text-gray-900">{Math.round((hovered.value / total) * 100)}%</span>
              <span className="max-w-[80%] truncate text-[11px] text-gray-500">{hovered.label}</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums text-gray-900">{centerValue}</span>
              <span className="text-[11px] text-gray-500">{centerLabel}</span>
            </>
          )}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1">
        {segments.map((s, i) => (
          <li
            key={s.label}
            className={cn(
              "flex cursor-default items-center justify-between gap-3 rounded-md px-2 py-1 text-sm transition-colors",
              active === i && "bg-gray-50",
              s.value === 0 && "opacity-50",
            )}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate text-gray-600">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold text-gray-900">{s.value}</span>
              <span className="ml-1.5 text-xs text-gray-400">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared status palette so participant and reviewer charts read the same way. */
export const STATUS_COLORS = {
  completed: "#10b981",
  inProgress: "#3b82f6",
  notStarted: "#cbd5e1",
  pending: "#f59e0b",
  declined: "#f87171",
};
