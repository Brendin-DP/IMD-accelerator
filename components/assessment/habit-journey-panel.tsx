"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Lock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HabitReport } from "@/components/assessment/habit-report";
import { QuestionText } from "@/components/assessment/question-field";
import { isHabitJourney, parseConfig, questionConfig, resolveJourney, type ResolvedJourney } from "@/lib/assessment-config";
import {
  loadDefinition,
  loadJourneyReport,
  questionByKey,
  resolveDefinitionId,
  sharedQuestion,
  type JourneyReport,
  type Row,
} from "@/lib/habit-journey";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

export interface JourneyContext {
  journey: ResolvedJourney;
  definitionId: string;
  submitted: boolean;
}

type StepState = "done" | "current" | "locked" | "open";

/**
 * The phase-1 habit journey on the participant's assessment page:
 * 1 Define your habit → 2 Observable actions → 3 Nominate reviewers → 4 Review feedback.
 * Renders nothing for classic assessments (definitions without a habit-journey config).
 */
export function HabitJourneyPanel({
  cohortAssessmentId,
  subdomain,
  participantAssessment,
  userId,
  activeNominations,
  acceptedNominations,
  refreshKey,
  onNominate,
  onJourney,
}: {
  cohortAssessmentId: string;
  subdomain: string;
  participantAssessment: { id: string; status: string | null } | null;
  userId: string | null;
  activeNominations: number;
  acceptedNominations: number;
  refreshKey?: unknown;
  onNominate: () => void;
  onJourney?: (context: JourneyContext | null) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<{
    journey: ResolvedJourney;
    definitionId: string;
    questions: Row[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [report, setReport] = useState<JourneyReport | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const submitted = participantAssessment?.status?.toLowerCase() === "completed";
  const onboardingKey = userId ? `imd_habit_onboarding_dismissed_${userId}` : null;

  // Definition + config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const definitionId = await resolveDefinitionId(cohortAssessmentId);
      if (!definitionId) return onJourney?.(null);
      const { definition, questions } = await loadDefinition(definitionId);
      if (cancelled) return;
      if (!definition || !isHabitJourney(parseConfig(definition.config))) {
        setState(null);
        onJourney?.(null);
        return;
      }
      const journey = resolveJourney(definition.config);
      setState({ journey, definitionId, questions });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortAssessmentId]);

  useEffect(() => {
    if (state) onJourney?.({ journey: state.journey, definitionId: state.definitionId, submitted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, submitted]);

  // Onboarding disclaimer, once per user unless dismissed for good
  useEffect(() => {
    if (!state || !onboardingKey || submitted) return;
    try {
      if (!localStorage.getItem(onboardingKey)) setOnboardingOpen(true);
    } catch {
      /* storage unavailable: skip */
    }
  }, [state, onboardingKey, submitted]);

  // Participant's own answers and the report
  const loadProgress = useCallback(async () => {
    if (!state || !participantAssessment?.id) return;
    const { data: session } = await supabase
      .from("assessment_response_sessions")
      .select("id")
      .eq("participant_assessment_id", participantAssessment.id)
      .eq("assessment_definition_id", state.definitionId)
      .eq("respondent_type", "participant")
      .eq("phase", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      const { data: rows } = await supabase
        .from("assessment_responses")
        .select("question_id, answer_text")
        .eq("session_id", session.id)
        .eq("is_answered", true);
      setAnswers(Object.fromEntries((rows ?? []).map((r: Row) => [r.question_id, r.answer_text ?? ""])));
    }
    setReport(
      await loadJourneyReport(participantAssessment.id, state.definitionId, state.questions, state.journey.minResponses),
    );
  }, [state, participantAssessment?.id]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress, refreshKey, participantAssessment?.status]);

  const view = useMemo(() => {
    if (!state) return null;
    const planQ = questionByKey(state.questions, "plan_commitment");
    const observeQ = sharedQuestion(state.questions);
    const promptQ = questionByKey(state.questions, "nominate_prompt");
    const plan = planQ ? answers[planQ.id] ?? "" : "";
    const observe = observeQ ? answers[observeQ.id] ?? "" : "";
    const { min, max } = state.journey.reviewers;
    const stepStates: StepState[] = [
      plan.trim() ? "done" : "current",
      submitted ? "done" : plan.trim() ? "current" : "locked",
      !submitted ? "locked" : activeNominations >= min ? "done" : "current",
      !submitted || activeNominations === 0 ? "locked" : report?.enough ? "done" : "open",
    ];
    return { planQ, observeQ, promptQ, plan, observe, min, max, stepStates };
  }, [state, answers, submitted, activeNominations, report]);

  if (!state || !view) return null;
  const { journey } = state;
  const steps = [
    { title: "Define your habit", hint: questionConfig(view.planQ ?? {}).tooltip },
    { title: "Observable actions", hint: questionConfig(view.observeQ ?? {}).tooltip },
    { title: "Nominate reviewers", hint: questionConfig(view.promptQ ?? {}).tooltip },
    { title: "Review your feedback", hint: "Review the feedback received from your reviewers." },
  ];
  const furthest = (() => {
    const firstOpen = view.stepStates.findIndex((s) => s === "current");
    if (firstOpen >= 0) return firstOpen;
    return view.stepStates.lastIndexOf("open") >= 0 ? view.stepStates.lastIndexOf("open") : 3;
  })();
  const active = selected ?? furthest;
  const questionnaireHref = `/tenant/${subdomain}/assessments/${cohortAssessmentId}/questionnaire?source=db`;

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{journey.copy.programName}</h2>
          <p className="text-xs text-muted-foreground">Phase 1 · build your habit and gather feedback</p>
        </div>
        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          className="text-xs font-medium text-primary hover:underline"
        >
          How it works
        </button>
      </header>

      {/* Step tiles */}
      <ol className="grid grid-cols-2 gap-px bg-gray-100 md:grid-cols-4">
        {steps.map((step, i) => {
          const st = view.stepStates[i];
          const isActive = i === active;
          return (
            <li key={step.title} className="bg-white">
              <button
                type="button"
                disabled={st === "locked"}
                onClick={() => setSelected(i)}
                title={step.hint}
                className={cn(
                  "flex h-full w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                  isActive ? "bg-primary/5" : "hover:bg-gray-50",
                  st === "locked" && "cursor-not-allowed opacity-60 hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    st === "done" ? "bg-emerald-500 text-white" : isActive ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {st === "done" ? <Check className="h-4 w-4" /> : st === "locked" ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", isActive ? "text-gray-900" : "text-gray-700")}>{step.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i === 2 && st !== "locked"
                      ? `${activeNominations} of ${view.min}–${view.max} nominated`
                      : i === 3 && report && st !== "locked"
                        ? `${report.responses} response${report.responses === 1 ? "" : "s"}`
                        : st === "done"
                          ? "Done"
                          : st === "locked"
                            ? "Locked"
                            : "To do"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Active step */}
      <div className="border-t border-gray-100 px-5 py-5">
        {active === 0 && (
          <StepBody
            title={view.planQ?.question_text ?? "Define your new leadership habit"}
            badge={<Badge icon={EyeOff}>Private — not shared with reviewers</Badge>}
          >
            {view.plan ? <Quote>{view.plan}</Quote> : <Empty>You haven&apos;t defined your habit yet.</Empty>}
            {!submitted && (
              <Button className="mt-4" onClick={() => router.push(questionnaireHref)}>
                {view.plan ? "Edit and continue" : "Start step 1"}
              </Button>
            )}
          </StepBody>
        )}

        {active === 1 && (
          <StepBody
            title={view.observeQ?.question_text ?? "Describe observable actions"}
            badge={<Badge icon={Eye}>Shared with your reviewers</Badge>}
          >
            {view.observe ? <Quote>{view.observe}</Quote> : <Empty>Not answered yet.</Empty>}
            {!submitted && (
              <Button className="mt-4" onClick={() => router.push(questionnaireHref)}>
                {view.observe ? "Review and submit" : "Continue"}
              </Button>
            )}
          </StepBody>
        )}

        {active === 2 && (
          <StepBody title={steps[2].title}>
            {view.promptQ && (
              <QuestionText
                text={view.promptQ.question_text}
                values={{ min: String(view.min), max: String(view.max) }}
                className="text-sm text-gray-700"
              />
            )}
            <p className="mt-3 text-sm text-muted-foreground">{journey.copy.nominationsPanelHeader}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={onNominate} disabled={activeNominations >= view.max}>
                <UserPlus className="mr-2 h-4 w-4" />
                {journey.copy.nominateModalTitle}
              </Button>
              <span className="text-sm text-muted-foreground">
                {activeNominations} nominated · {acceptedNominations} accepted ·{" "}
                {activeNominations < view.min
                  ? `${view.min - activeNominations} more needed`
                  : activeNominations >= view.max
                    ? "maximum reached"
                    : `up to ${view.max - activeNominations} more`}
              </span>
            </div>
          </StepBody>
        )}

        {active === 3 && (
          <StepBody title="Your feedback">
            <HabitReport
              report={report}
              slider={journey.slider}
              minResponses={journey.minResponses}
              markerLabel={journey.copy.reportYouLabel}
            />
          </StepBody>
        )}
      </div>

      <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{journey.copy.onboardingTitle}</DialogTitle>
            <DialogDescription>{journey.copy.onboardingBody}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-1.5 text-sm text-gray-700">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-2">
                <span className="font-semibold text-primary">{i + 1}.</span> {s.title}
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
              Don&apos;t show this again
            </label>
            <Button
              onClick={() => {
                if (dontShowAgain && onboardingKey) {
                  try {
                    localStorage.setItem(onboardingKey, "1");
                  } catch {
                    /* ignore */
                  }
                }
                setOnboardingOpen(false);
              }}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StepBody({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <QuestionText text={title} className="text-sm font-semibold text-gray-900" />
        {badge}
      </div>
      {children}
    </div>
  );
}

function Badge({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

const Quote = ({ children }: { children: React.ReactNode }) => (
  <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-primary/40 bg-gray-50 px-4 py-3 text-sm text-gray-800">
    {children}
  </blockquote>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
