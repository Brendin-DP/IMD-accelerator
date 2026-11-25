/**
 * Data helpers for habit-journey programmes (see lib/assessment-config.ts).
 * Everything goes through the normal Supabase-shaped client, so it works the
 * same against the mock DB and a real database.
 */
import { supabase } from "@/lib/supabaseClient";
import { isAnswerable, isHabitJourney, parseConfig, questionConfig, questionContext } from "@/lib/assessment-config";

// Rows come back untyped from the Supabase-shaped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

// ---------------------------------------------------------------- definitions

/**
 * The assessment definition for a cohort assessment: the explicit
 * `cohort_assessments.assessment_definition_id`, else the plan's mapping,
 * else the system definition for the type.
 */
export async function resolveDefinitionId(cohortAssessmentId: string): Promise<string | null> {
  const { data: ca } = await supabase
    .from("cohort_assessments")
    .select("assessment_definition_id, assessment_type_id, cohort:cohorts(plan:plans(description))")
    .eq("id", cohortAssessmentId)
    .maybeSingle();
  if (!ca) return null;
  if (ca.assessment_definition_id) return ca.assessment_definition_id;
  const description: string | undefined = (ca as Row).cohort?.plan?.description;
  const match = description?.match(/<!--PLAN_ASSESSMENT_DEFINITIONS:(.*?)-->/);
  if (match) {
    try {
      const mapped = JSON.parse(match[1])[ca.assessment_type_id];
      if (mapped) return mapped;
    } catch {
      /* fall through */
    }
  }
  const { data: system } = await supabase
    .from("assessment_definitions_v2")
    .select("id")
    .eq("assessment_type_id", ca.assessment_type_id)
    .eq("is_system", true)
    .maybeSingle();
  return system?.id ?? null;
}

export async function loadDefinition(definitionId: string) {
  const [{ data: definition }, { data: steps }, { data: questions }] = await Promise.all([
    supabase.from("assessment_definitions_v2").select("*").eq("id", definitionId).maybeSingle(),
    supabase.from("assessment_steps_v2").select("*").eq("assessment_definition_id", definitionId).order("step_order"),
    supabase.from("assessment_questions_v2").select("*").eq("assessment_definition_id", definitionId).order("question_order"),
  ]);
  return { definition: definition as Row | null, steps: (steps ?? []) as Row[], questions: (questions ?? []) as Row[] };
}

/** A question by its config key, e.g. "observe_actions" or "reviewer_rating". */
export const questionByKey = (questions: Row[], key: string) => questions.find((q) => questionConfig(q).key === key);

/** The participant answer that reviewers are shown (config.sharedWithReviewers), falling back to "observe_actions". */
export const sharedQuestion = (questions: Row[]) =>
  questions.find((q) => questionConfig(q).sharedWithReviewers) ?? questionByKey(questions, "observe_actions");

// ---------------------------------------------------------------- placeholders

/** Values for {participant_name} and {t1_commitment} in reviewer/self-reflection questions. */
export async function loadPlaceholderValues(participantAssessmentId: string, definitionId: string, questions: Row[]) {
  const { data: pa } = await supabase
    .from("participant_assessments")
    .select("participant:cohort_participants(client_user:client_users(name, surname))")
    .eq("id", participantAssessmentId)
    .maybeSingle();
  const user = (pa as Row | null)?.participant?.client_user;
  const shared = sharedQuestion(questions);
  let commitment: string | null = null;
  if (shared) {
    const { data: session } = await supabase
      .from("assessment_response_sessions")
      .select("id")
      .eq("participant_assessment_id", participantAssessmentId)
      .eq("assessment_definition_id", definitionId)
      .eq("respondent_type", "participant")
      .eq("phase", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session) {
      const { data: response } = await supabase
        .from("assessment_responses")
        .select("answer_text")
        .eq("session_id", session.id)
        .eq("question_id", shared.id)
        .maybeSingle();
      commitment = response?.answer_text ?? null;
    }
  }
  return {
    participant_name: user ? `${user.name ?? ""}`.trim() || "the participant" : "the participant",
    participant_full_name: user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() : "",
    t1_commitment: commitment ?? "…",
  };
}

// ---------------------------------------------------------------- phases & invitations

/** The cohort assessment's phase row, created (T1/T2…) on first use. */
export async function ensurePhase(cohortAssessmentId: string, phaseNumber = 1): Promise<Row | null> {
  const { data: existing } = await supabase
    .from("cohort_assessment_phases")
    .select("*")
    .eq("cohort_assessment_id", cohortAssessmentId)
    .eq("phase_number", phaseNumber)
    .maybeSingle();
  if (existing) return existing;
  const { data: ca } = await supabase.from("cohort_assessments").select("start_date").eq("id", cohortAssessmentId).maybeSingle();
  const { data: created } = await supabase
    .from("cohort_assessment_phases")
    .insert({
      cohort_assessment_id: cohortAssessmentId,
      phase_number: phaseNumber,
      name: `T${phaseNumber}`,
      start_date: phaseNumber === 1 ? ca?.start_date ?? null : null,
    })
    .select()
    .single();
  return created ?? null;
}

/** Record a phase-1 round invitation for each new nomination. */
export async function recordInvitations(nominationIds: string[], cohortAssessmentId: string, phaseNumber = 1) {
  if (!nominationIds.length) return;
  const phase = await ensurePhase(cohortAssessmentId, phaseNumber);
  if (!phase) return;
  const now = new Date().toISOString();
  await supabase.from("reviewer_round_invitations").upsert(
    nominationIds.map((id) => ({ reviewer_nomination_id: id, phase_id: phase.id, status: "sent", sent_at: now })),
    { onConflict: "reviewer_nomination_id,phase_id", ignoreDuplicates: true },
  );
}

/** Mark a reviewer's round invitation as opened/completed. */
export async function updateInvitation(nominationId: string, cohortAssessmentId: string, status: "opened" | "completed", phaseNumber = 1) {
  const phase = await ensurePhase(cohortAssessmentId, phaseNumber);
  if (!phase) return;
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("reviewer_round_invitations")
    .select("id, status")
    .eq("reviewer_nomination_id", nominationId)
    .eq("phase_id", phase.id)
    .maybeSingle();
  if (existing?.status === "completed") return;
  const patch = { status, ...(status === "completed" ? { completed_at: now } : {}) };
  if (existing) await supabase.from("reviewer_round_invitations").update(patch).eq("id", existing.id);
  else await supabase.from("reviewer_round_invitations").insert({ reviewer_nomination_id: nominationId, phase_id: phase.id, sent_at: now, ...patch });
}

// ---------------------------------------------------------------- report

export interface JourneyReport {
  responses: number;
  ratings: number[];
  average: number | null;
  min: number | null;
  max: number | null;
  suggestions: string[];
  enough: boolean;
}

/**
 * Phase-1 report: anonymous stats over completed reviewer sessions. Ratings
 * come from the reviewer slider question; suggestions from the reviewer text
 * question(s). Reviewer identities are never returned.
 */
export async function loadJourneyReport(
  participantAssessmentId: string,
  definitionId: string,
  questions: Row[],
  minResponses: number,
  phase = 1,
): Promise<JourneyReport> {
  const reviewerQuestions = questions.filter((q) => questionContext(q) === "reviewer");
  const ratingIds = new Set(reviewerQuestions.filter((q) => q.question_type === "slider").map((q) => q.id));
  const textIds = new Set(reviewerQuestions.filter((q) => q.question_type !== "slider" && q.question_type !== "heading" && q.question_type !== "info").map((q) => q.id));

  const { data: sessions } = await supabase
    .from("assessment_response_sessions")
    .select("id")
    .eq("participant_assessment_id", participantAssessmentId)
    .eq("assessment_definition_id", definitionId)
    .eq("status", "completed")
    .eq("phase", phase)
    .in("respondent_type", ["client_user", "external_reviewer"]);
  const sessionIds = (sessions ?? []).map((s: Row) => s.id);

  let ratings: number[] = [];
  let suggestions: string[] = [];
  if (sessionIds.length) {
    const { data: responses } = await supabase
      .from("assessment_responses")
      .select("question_id, answer_text, answer_json")
      .in("session_id", sessionIds)
      .eq("is_answered", true);
    for (const r of (responses ?? []) as Row[]) {
      if (ratingIds.has(r.question_id)) {
        const n = typeof r.answer_json === "number" ? r.answer_json : Number(r.answer_text);
        if (Number.isFinite(n)) ratings.push(n);
      } else if (textIds.has(r.question_id) && r.answer_text?.trim()) {
        suggestions.push(r.answer_text.trim());
      }
    }
  }
  // Order-independent so suggestions can't be matched to the nomination list.
  suggestions = suggestions.sort((a, b) => a.localeCompare(b));
  ratings = ratings.sort((a, b) => a - b);
  const responsesCount = sessionIds.length;
  const average = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null;
  return {
    responses: responsesCount,
    ratings,
    average,
    min: ratings.length ? ratings[0] : null,
    max: ratings.length ? ratings[ratings.length - 1] : null,
    suggestions,
    enough: responsesCount >= minResponses,
  };
}

// ---------------------------------------------------------------- progress

/**
 * How many questions a respondent answers in a definition, for progress bars.
 * Classic definitions (no config): every question, exactly as before.
 * Habit journeys: phase-1 answerable questions for that respondent's context.
 */
export async function countAnswerableQuestions(definitionId: string, respondent: "participant" | "reviewer"): Promise<number> {
  const { definition, steps, questions } = await loadDefinition(definitionId);
  if (!isHabitJourney(parseConfig(definition?.config))) return questions.length;
  const phaseOf = (stepId: string | null) => steps.find((s) => s.id === stepId)?.phase_number ?? 1;
  return questions.filter((q) => {
    const context = questionContext(q);
    return isAnswerable(q) && (context === null || context === respondent) && phaseOf(q.step_id) === 1;
  }).length;
}
