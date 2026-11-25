/**
 * Programme configuration stored on assessment definitions
 * (`assessment_definitions_v2.config`) and on questions
 * (`assessment_questions_v2.config`).
 *
 * A definition without config behaves exactly as before (classic 360/pulse).
 * A definition whose config has `variant: "habit_journey"` runs the generic
 * "habit journey": participant defines a habit + observable actions, nominates
 * reviewers, reviewers rate on a slider and suggest one action, participant
 * sees a report. Client programmes (e.g. a branded "Habit Accelerator") are
 * just definitions carrying this config with their own copy.
 */

export type QuestionContext = "participant" | "reviewer" | "self_reflection";

export interface SliderConfig {
  min: number;
  max: number;
  labels?: { min?: string; max?: string };
  instruction?: string;
}

export interface RangeRule {
  min: number;
  max: number;
}

export interface NominationRules {
  internal: RangeRule;
  external: RangeRule;
  /** Phase-2 eligibility bar: distinct completed phase-1 reviews required. */
  selfReflectionMinReviews: number;
}

export interface PhaseConfig {
  name?: string;
  steps: string[];
  isSelfReflection?: boolean;
}

export interface ProgrammeCopy {
  programName?: string;
  nominationsPanelHeader?: string;
  nominateModalTitle?: string;
  /** May use {min} / {max}, filled from the nomination rules. */
  reviewerDetailsFormHeader?: string;
  addReviewerButtonText?: string;
  externalReviewerInfoMessage?: string;
  sliderInstruction?: string;
  onboardingTitle?: string;
  onboardingBody?: string;
  submitModalTitle?: string;
  submitModalBody?: string;
  submitModalConfirm?: string;
  submitModalCancel?: string;
  reportYouLabel?: string;
}

export interface DefinitionConfig {
  variant?: "habit_journey" | string;
  slider?: SliderConfig;
  phases?: Record<string, PhaseConfig>;
  nominationRules?: NominationRules;
  report?: { minResponses?: number };
  copy?: ProgrammeCopy;
}

export interface QuestionConfig {
  /** Stable key, e.g. "plan_commitment", "observe_actions", "reviewer_rating". */
  key?: string;
  context?: QuestionContext;
  /** Slider bounds/labels (fall back to the definition's slider config). */
  min?: number;
  max?: number;
  labels?: { min?: string; max?: string };
  placeholder?: string;
  maxLength?: number;
  tooltip?: string;
  /** Shown to reviewers as the participant's commitment. */
  sharedWithReviewers?: boolean;
}

export const HABIT_JOURNEY = "habit_journey";

export const DEFAULT_SLIDER: SliderConfig = {
  min: 1,
  max: 7,
  labels: { min: "Not at all", max: "To a very great extent" },
  instruction: "Drag the circle to the left or right to provide your assessment of the habit.",
};

export const DEFAULT_NOMINATION_RULES: NominationRules = {
  internal: { min: 0, max: 5 },
  external: { min: 2, max: 5 },
  selfReflectionMinReviews: 2,
};

export const DEFAULT_COPY: Required<ProgrammeCopy> = {
  programName: "Habit Accelerator",
  nominationsPanelHeader:
    "Confirm the colleagues who observed you in action and can give you diverse, constructive feedback.",
  nominateModalTitle: "Nominate Reviewers",
  reviewerDetailsFormHeader: "Reviewer Details (Minimum {min}, Maximum {max})",
  addReviewerButtonText: "Add Reviewer",
  externalReviewerInfoMessage: "Invite your reviewers to give feedback on your leadership habit.",
  sliderInstruction: DEFAULT_SLIDER.instruction!,
  onboardingTitle: "Before you start",
  onboardingBody:
    "Over the next steps you will define one leadership habit, describe the visible actions that show it, and invite colleagues to give you feedback. Your habit (step 1) stays private; the observable actions (step 2) are shared with your reviewers.",
  submitModalTitle: "Are you ready to submit and share your new leadership habit?",
  submitModalBody:
    "In a next step, your leadership habit will be shared with the reviewers you nominate and cannot be changed. Please take a moment before submitting to ensure it is clear, observable, and reflects the habit you want to commit to.",
  submitModalConfirm: "Submit",
  submitModalCancel: "Go back to review",
  reportYouLabel: "Baseline",
};

/** Parse a JSON column that may arrive as an object or (legacy) a JSON string. */
export function parseConfig<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

export function isHabitJourney(config: DefinitionConfig | null | undefined): boolean {
  return config?.variant === HABIT_JOURNEY;
}

/** Fully resolved settings for a habit-journey definition (defaults filled in). */
export function resolveJourney(raw: unknown) {
  const config = parseConfig<DefinitionConfig>(raw) ?? {};
  const rules = config.nominationRules ?? DEFAULT_NOMINATION_RULES;
  const copy = { ...DEFAULT_COPY, ...(config.copy ?? {}) };
  // Overall reviewer bounds: per-channel minimums add up; the max is the larger channel max.
  const internal = rules.internal ?? DEFAULT_NOMINATION_RULES.internal;
  const external = rules.external ?? DEFAULT_NOMINATION_RULES.external;
  const limits = { min: internal.min + external.min, max: Math.max(internal.max, external.max) };
  return {
    config,
    slider: { ...DEFAULT_SLIDER, ...(config.slider ?? {}), labels: { ...DEFAULT_SLIDER.labels, ...(config.slider?.labels ?? {}) } },
    rules: {
      internal: rules.internal ?? DEFAULT_NOMINATION_RULES.internal,
      external: rules.external ?? DEFAULT_NOMINATION_RULES.external,
      selfReflectionMinReviews: rules.selfReflectionMinReviews || DEFAULT_NOMINATION_RULES.selfReflectionMinReviews,
    },
    minResponses: config.report?.minResponses ?? 2,
    reviewers: limits,
    copy: {
      ...copy,
      reviewerDetailsFormHeader: fill(copy.reviewerDetailsFormHeader, { min: String(limits.min), max: String(limits.max) }),
    },
  };
}

export type ResolvedJourney = ReturnType<typeof resolveJourney>;

/** Slider bounds for a question, falling back to the definition's slider. */
export function sliderFor(question: { config?: unknown }, journeySlider: SliderConfig = DEFAULT_SLIDER): SliderConfig {
  const qc = parseConfig<QuestionConfig>(question.config) ?? {};
  return {
    min: qc.min ?? journeySlider.min,
    max: qc.max ?? journeySlider.max,
    labels: { ...journeySlider.labels, ...(qc.labels ?? {}) },
    instruction: journeySlider.instruction,
  };
}

export function questionConfig(question: { config?: unknown }): QuestionConfig {
  return parseConfig<QuestionConfig>(question.config) ?? {};
}

/** Context of a question; questions without one are answered by everyone (classic behaviour). */
export function questionContext(question: { config?: unknown }): QuestionContext | null {
  return questionConfig(question).context ?? null;
}

/** Non-answerable question types (display only). */
export const DISPLAY_ONLY_TYPES = new Set(["heading", "info"]);
export const isAnswerable = (q: { question_type?: string }) => !DISPLAY_ONLY_TYPES.has(q.question_type ?? "");

// ---------------------------------------------------------------- text helpers

/** Replace {name} tokens. Unknown tokens are left as-is. */
export function fill(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null ? String(values[k]) : m));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ALLOWED_TAGS = /^<\/?(b|strong|i|em|u|br)\s*\/?>$/i;

/**
 * Question text supports a tiny rich-text subset (<b>, <strong>, <i>, <em>,
 * <u>, <br>). Everything else is escaped, and placeholder values are always
 * escaped, so participant answers can never inject markup.
 */
export function renderQuestionHtml(text: string, values: Record<string, string | null | undefined> = {}): string {
  const escapedValues = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === null || v === undefined ? v : escapeHtml(String(v))]),
  );
  return text
    .split(/(<[^>]*>)/g)
    .map((part) => (part.startsWith("<") ? (ALLOWED_TAGS.test(part) ? part.toLowerCase() : escapeHtml(part)) : fill(escapeHtml(part), escapedValues)))
    .join("");
}

/** Plain-text version of question text (for lists, PDFs, tooltips). */
export function questionPlainText(text: string, values: Record<string, string | null | undefined> = {}): string {
  return fill(text.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""), values).replace(/\s+/g, " ").trim();
}

/**
 * Editor preview of question text: same tag whitelist as renderQuestionHtml,
 * but {tokens} are shown as labelled chips instead of being filled in.
 */
export function renderQuestionPreview(text: string): string {
  return text
    .split(/(<[^>]*>)/g)
    .map((part) =>
      part.startsWith("<")
        ? ALLOWED_TAGS.test(part)
          ? part.toLowerCase()
          : escapeHtml(part)
        : escapeHtml(part).replace(
            /\{(\w+)\}/g,
            '<span class="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1 py-px font-mono text-[11px] font-medium text-primary">$1</span>',
          ),
    )
    .join("");
}
