/**
 * Database behaviour that can't be derived from database.types.ts.
 * Mirror Postgres constraints here as the prototype grows.
 */

/** Unique constraints beyond the primary key (`id`). */
export const UNIQUE_CONSTRAINTS: Record<string, string[][]> = {
  assessment_reports: [["participant_assessment_id", "report_type", "phase"]],
  assessment_responses: [["session_id", "question_id"]],
  cohort_assessment_phases: [["cohort_assessment_id", "phase_number"]],
  reviewer_round_invitations: [["reviewer_nomination_id", "phase_id"]],
};

/** Defaults for text columns that Postgres fills in (keyed "table.column"). */
export const STRING_DEFAULTS: Record<string, unknown> = {
  "assessment_questions_v2.question_type": "text",
  "assessment_reports.report_type": "assessment",
  "assessment_response_sessions.status": "not_started",
  "assessment_response_sessions.completion_percent": 0,
  "client_users.status": "active",
  "assessment_steps_v2.phase_number": 1,
  "assessment_response_sessions.phase": 1,
  "assessment_reports.phase": 1,
  "reviewer_round_invitations.status": "pending",
};

/**
 * What happens to child rows when a referenced row is deleted, keyed by
 * foreign key name. Unlisted foreign keys cascade.
 */
export const CASCADE_DELETES: Record<string, "cascade" | "set null" | "restrict"> = {
  clients_created_by_fkey: "set null",
  cohorts_created_by_fkey: "set null",
  external_reviewers_invited_by_fkey: "set null",
  assessment_definitions_v2_base_assessment_id_fkey: "set null",
  cohort_assessments_assessment_definition_id_fkey: "set null",
  cohorts_plan_id_fkey: "set null",
  assessment_response_sessions_last_question_fkey: "set null",
  assessment_response_sessions_last_step_fkey: "set null",
};
