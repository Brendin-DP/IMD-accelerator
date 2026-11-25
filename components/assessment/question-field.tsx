"use client";

import { MicTextarea } from "@/components/mictextarea";
import {
  DEFAULT_SLIDER,
  questionConfig,
  renderQuestionHtml,
  sliderFor,
  type SliderConfig,
} from "@/lib/assessment-config";
import { cn } from "@/lib/utils";

export interface FieldQuestion {
  id: string;
  question_type?: string | null;
  required?: boolean | null;
  config?: unknown;
  text?: string;
  question_text?: string;
}

/** Question text with the small rich-text subset and {placeholders} filled in. */
export function QuestionText({
  text,
  values,
  className,
}: {
  text: string;
  values?: Record<string, string | null | undefined>;
  className?: string;
}) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderQuestionHtml(text, values) }} />;
}

/** Display-only blocks (question_type "heading"/"info") shown at the top of a step. */
export function StepHeadings({
  headings,
  values,
}: {
  headings: FieldQuestion[];
  values?: Record<string, string | null | undefined>;
}) {
  if (!headings.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-primary/15 bg-primary/5 px-5 py-4">
      {headings.map((h) => (
        <QuestionText
          key={h.id}
          text={h.text ?? h.question_text ?? ""}
          values={values}
          className="text-sm leading-relaxed text-gray-800 [&_b]:font-semibold [&_b]:text-gray-900"
        />
      ))}
    </div>
  );
}

/** 1–N rating slider. Value is stored as a string (answer_text) and as an integer (answer_json). */
export function RatingSlider({
  value,
  onChange,
  slider = DEFAULT_SLIDER,
  readOnly,
  id,
}: {
  value: string;
  onChange?: (next: string) => void;
  slider?: SliderConfig;
  readOnly?: boolean;
  id?: string;
}) {
  const n = value === "" || value === undefined || value === null ? null : Number(value);
  const ticks = Array.from({ length: slider.max - slider.min + 1 }, (_, i) => slider.min + i);
  const mid = Math.round((slider.min + slider.max) / 2);
  return (
    <div className="space-y-3">
      {slider.instruction && !readOnly && <p className="text-xs text-muted-foreground">{slider.instruction}</p>}
      <div className="flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={slider.min}
          max={slider.max}
          step={1}
          value={n ?? mid}
          disabled={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          onClick={(e) => n === null && onChange?.((e.target as HTMLInputElement).value)}
          className={cn("h-2 w-full cursor-pointer accent-[var(--primary)]", n === null && "opacity-40", readOnly && "cursor-default")}
          aria-valuetext={n === null ? "Not answered" : String(n)}
        />
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            n === null ? "bg-gray-100 text-gray-400" : "bg-primary text-primary-foreground",
          )}
        >
          {n ?? "–"}
        </span>
      </div>
      <div className="flex justify-between pr-[52px] text-[11px] tabular-nums text-gray-400">
        {ticks.map((t) => (
          <span key={t} className="w-4 text-center">{t}</span>
        ))}
      </div>
      {(slider.labels?.min || slider.labels?.max) && (
        <div className="flex justify-between pr-[52px] text-xs text-muted-foreground">
          <span>{slider.labels?.min}</span>
          <span>{slider.labels?.max}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The answer input for a question, chosen by question_type:
 * slider → RatingSlider, anything else → MicTextarea (with optional maxLength).
 */
export function QuestionField({
  question,
  value,
  onChange,
  slider,
  readOnly,
}: {
  question: FieldQuestion;
  value: string;
  onChange: (next: string) => void;
  slider?: SliderConfig;
  readOnly?: boolean;
}) {
  const qc = questionConfig(question);
  if (question.question_type === "slider") {
    return <RatingSlider id={`answer-${question.id}`} value={value} onChange={onChange} slider={sliderFor(question, slider)} readOnly={readOnly} />;
  }
  if (readOnly) {
    return <p className="whitespace-pre-wrap rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-800">{value || "—"}</p>;
  }
  const max = qc.maxLength;
  return (
    <div className="space-y-1">
      <MicTextarea
        value={value}
        onChange={(next) => onChange(max ? next.slice(0, max) : next)}
        placeholder={qc.placeholder || "Type your answer… or hold the mic to speak"}
      />
      {max ? (
        <p className={cn("text-right text-xs tabular-nums", value.length >= max ? "text-destructive" : "text-muted-foreground")}>
          {value.length}/{max}
        </p>
      ) : null}
    </div>
  );
}
