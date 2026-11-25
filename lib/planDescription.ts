/**
 * Plans store which assessment definition each assessment type uses inside
 * their description, as a hidden marker:
 *   <!--PLAN_ASSESSMENT_DEFINITIONS:{"type_id":"definition_id"}-->
 * Participant pages, reports and cohort pages read it, so it must be kept —
 * but people should only ever see and edit the human-written text.
 */
const MARKER = /<!--PLAN_ASSESSMENT_DEFINITIONS:.*?-->/g;

/** The description without the hidden mapping marker. */
export function planDescriptionText(description?: string | null): string {
  return (description ?? "").replace(MARKER, "").trim();
}

/** Combine edited text with the mapping marker from the stored description. */
export function withPlanMapping(text: string, storedDescription?: string | null): string | null {
  const marker = (storedDescription ?? "").match(MARKER)?.[0];
  const clean = planDescriptionText(text);
  if (!marker) return clean || null;
  return clean ? `${clean}\n${marker}` : marker;
}
