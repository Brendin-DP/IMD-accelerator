"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InfoStripItem {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

type Phase = "upcoming" | "active" | "completed";

const PHASE_STYLES: Record<Phase, { label: string; className: string; dot: string }> = {
  upcoming: { label: "Upcoming", className: "bg-amber-50 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
  active: { label: "Active", className: "bg-blue-50 text-blue-700 ring-blue-600/20", dot: "bg-blue-500" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
};

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Where today sits between two dates: phase, elapsed share and a short caption. */
export function getTimeline(start?: string | null, end?: string | null) {
  const today = startOfDay(new Date());
  const s = start ? startOfDay(new Date(start)) : null;
  const e = end ? startOfDay(new Date(end)) : null;
  if (!s || !e) {
    const phase: Phase = e && e < today ? "completed" : s && s > today ? "upcoming" : "active";
    return { phase, progress: null as number | null, caption: null as string | null, range: s ? `${fmt(s)} – not set` : e ? `Not set – ${fmt(e)}` : "Dates not set" };
  }
  const total = Math.max(1, Math.round((e.getTime() - s.getTime()) / DAY));
  const elapsed = Math.round((today.getTime() - s.getTime()) / DAY);
  const range = `${fmt(s)} – ${fmt(e)}`;
  if (elapsed < 0) return { phase: "upcoming" as Phase, progress: 0, caption: `Starts in ${-elapsed} day${elapsed === -1 ? "" : "s"}`, range };
  if (elapsed >= total) return { phase: "completed" as Phase, progress: 1, caption: `Ended ${elapsed - total === 0 ? "today" : `${elapsed - total} days ago`}`, range };
  const left = total - elapsed;
  return { phase: "active" as Phase, progress: elapsed / total, caption: `Day ${elapsed + 1} of ${total} · ${left} day${left === 1 ? "" : "s"} left`, range };
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  const p = PHASE_STYLES[phase];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", p.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
      {p.label}
    </span>
  );
}

/**
 * Compact summary bar: a row of labelled facts plus an optional timeline that
 * shows how far through its date range the cohort/assessment is.
 */
export function InfoStrip({
  items,
  start,
  end,
  className,
}: {
  items: InfoStripItem[];
  start?: string | null;
  end?: string | null;
  className?: string;
}) {
  const t = getTimeline(start, end);
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      <dl className="grid grid-cols-2 divide-gray-100 sm:flex sm:divide-x">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex min-w-0 items-center gap-3 px-4 py-3 sm:flex-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className="truncate text-sm font-semibold text-gray-900">{value}</dd>
            </div>
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-3 px-4 py-3 sm:flex-[1.6]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-gray-900">{t.range}</span>
              <PhaseBadge phase={t.phase} />
            </div>
            {t.progress !== null && (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn("h-full rounded-full", t.phase === "completed" ? "bg-emerald-500" : t.phase === "upcoming" ? "bg-amber-400" : "bg-primary")}
                    style={{ width: `${Math.round(t.progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">{t.caption}</p>
              </>
            )}
          </div>
        </div>
      </dl>
    </div>
  );
}
