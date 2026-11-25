"use client";

import { Lock, MessageSquareQuote } from "lucide-react";
import type { SliderConfig } from "@/lib/assessment-config";
import type { JourneyReport } from "@/lib/habit-journey";

/**
 * Phase-1 habit report: anonymous reviewer slider stats (average, lowest,
 * highest) on the programme scale, plus the reviewers' suggestions. Hidden
 * until at least `minResponses` reviewers have completed (anonymity).
 */
export function HabitReport({
  report,
  slider,
  minResponses,
  markerLabel = "Baseline",
}: {
  report: JourneyReport | null;
  slider: SliderConfig;
  minResponses: number;
  markerLabel?: string;
}) {
  if (!report) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-50" />;
  }

  if (!report.enough) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-6">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Not enough responses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            To keep feedback anonymous, your report appears once at least {minResponses} reviewers have completed their
            feedback. {report.responses} of {minResponses} received so far.
          </p>
        </div>
      </div>
    );
  }

  const span = Math.max(1, slider.max - slider.min);
  const pos = (v: number) => `${((v - slider.min) / span) * 100}%`;
  const ticks = Array.from({ length: slider.max - slider.min + 1 }, (_, i) => slider.min + i);
  const fmt = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Average", value: fmt(report.average), accent: true },
          { label: "Lowest", value: fmt(report.min) },
          { label: "Highest", value: fmt(report.max) },
          { label: "Responses", value: String(report.responses) },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{s.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${s.accent ? "text-primary" : "text-gray-900"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Scale: shaded range from lowest to highest rating, marker at the average */}
      <div className="rounded-lg border border-gray-200 bg-white px-5 pb-4 pt-10">
        <div className="relative mx-2 h-2 rounded-full bg-gray-100">
          {report.min !== null && report.max !== null && (
            <div
              className="absolute inset-y-0 rounded-full bg-primary/25"
              style={{ left: pos(report.min), width: `calc(${pos(report.max)} - ${pos(report.min)})`, minWidth: 8 }}
              title={`Range ${report.min}–${report.max}`}
            />
          )}
          {report.average !== null && (
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(report.average) }}>
              <div className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
              <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {markerLabel} {fmt(report.average)}
              </span>
            </div>
          )}
        </div>
        <div className="mx-2 mt-2 flex justify-between text-[11px] tabular-nums text-gray-400">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="mx-2 mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{slider.labels?.min}</span>
          <span>{slider.labels?.max}</span>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Suggestions from your reviewers</h4>
        {report.suggestions.length ? (
          <ul className="space-y-2">
            {report.suggestions.map((text, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm text-gray-800">
                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No suggestions yet.</p>
        )}
      </div>
    </div>
  );
}
