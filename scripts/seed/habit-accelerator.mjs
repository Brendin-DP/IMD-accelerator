/**
 * Seeds the generic "Habit Accelerator" habit-journey programme and a demo
 * cohort for a fictional client (no production data):
 *
 *  - an editable assessment definition (type "pulse") whose `config` holds the
 *    variant, 1–7 slider, phases, nomination rules and copy
 *  - its 7 steps (phase 1: plan, observe, nominate, results; phase 2:
 *    reflection, feedback, phase2_results) and questions, each with a
 *    `config.context` saying who answers it (participant / reviewer / self_reflection)
 *  - a "Habit Accelerator" plan mapping the pulse type to that definition
 *  - a cohort with a T1 phase, participants at every phase-1 stage, reviewer
 *    nominations, per-round invitations and slider + suggestion reviews.
 *
 * Called from scripts/seed-demo.mjs with its helpers.
 */

export const HABITS = [
  ["Stepping in to solve problems myself instead of coaching my team to find the answer.",
   "In weekly one-to-ones with my four direct reports I will ask two open questions before offering any solution, and let them propose the next step."],
  ["Making decisions alone and announcing them late.",
   "In our Monday planning meeting I will share decisions that affect the team as drafts and ask for input before the meeting closes."],
  ["Filling every silence in meetings, which crowds out quieter colleagues.",
   "In project stand-ups I will invite the two quietest members to speak first and summarise what I heard before adding my view."],
  ["Giving feedback only when something goes wrong.",
   "Each Friday I will give one specific, positive piece of feedback to a team member about something I observed that week."],
  ["Over-committing my team to requests from other departments.",
   "When a new request arrives I will check capacity with the team lead before agreeing to a deadline, and say so openly in the request thread."],
  ["Checking work too closely instead of trusting the team.",
   "For the regional reporting pack I will agree the outcome upfront and only review the final version, not every draft."],
  ["", ""],
  ["Being hard to reach because my calendar is always full.",
   "I will keep two open office-hour slots each week and announce them in our team channel on Monday mornings."],
];

export const SUGGESTIONS = [
  "Try ending each one-to-one by asking what they will do next, and write it down together.",
  "Share the context behind your decisions earlier — even a two-line message helps.",
  "When you feel the urge to jump in, count to five first; the team usually gets there.",
  "Ask one person each week what you could do differently, and act on one thing visibly.",
  "Block thinking time in your calendar so you have space for coaching conversations.",
  "Close meetings by naming who owns each action — it reinforces trust in the team.",
  "Celebrate small wins publicly in the team channel; it sets the tone.",
];

/** Phase-1 states assigned to participants in order (cycled for bigger cohorts). */
export const PROFILES = [
  // state: answers = how far the participant got; reviews = statuses per nominated reviewer
  { id: "p1", answers: 2, reviews: ["Completed", "Completed", "accepted"] }, // report ready
  { id: "p2", answers: 2, reviews: ["Completed", "In progress"] }, // only 1 review → not enough responses
  { id: "p3", answers: 1, reviews: [] }, // never submits
  { id: "p4", answers: 2, reviews: ["Completed", "Completed", "Completed", "Completed"] },
  { id: "p5", answers: 2, reviews: ["pending", "pending"] }, // invites waiting on reviewers
  { id: "p6", answers: 2, reviews: [] }, // submitted, still has to nominate
  { id: "p7", answers: 0, reviews: [] }, // not started
  { id: "p8", answers: 2, reviews: ["Completed", "Completed", "rejected"] },
];

export const HABIT_DEMO = {
  participantEmail: null, // filled in at runtime (P1)
  reviewerEmail: null, // a reviewer with an open review for P1
};

export function seedHabitAccelerator(h) {
  const { uid, add, ts, date, between, pick, TYPE_PULSE, client, users, admin } = h;

  // ------------------------------------------------------------ definition
  const defId = uid("habit:definition");
  const config = {
    variant: "habit_journey",
    slider: {
      min: 1,
      max: 7,
      labels: { min: "Not at all", max: "To a very great extent" },
      instruction: "Drag the circle to the left or right to provide your assessment of the habit.",
    },
    phases: {
      1: { name: "T1", steps: ["plan", "observe", "nominate", "results"] },
      2: { name: "T2", steps: ["reflection", "feedback", "phase2_results"], isSelfReflection: true },
    },
    // Local reviewers sign in as client users, so this demo nominates internal
    // colleagues. A programme that invites external reviewers sets
    // external: { min: 2, max: 5 } instead.
    nominationRules: {
      internal: { min: 2, max: 5 },
      external: { min: 0, max: 5 },
      selfReflectionMinReviews: 2,
    },
    report: { minResponses: 2 },
    copy: {
      programName: "Habit Accelerator",
      nominationsPanelHeader:
        "Confirm the colleagues who observed you in action and can give you diverse, constructive feedback.",
      nominateModalTitle: "Nominate Reviewers",
      reviewerDetailsFormHeader: "Reviewer Details (Minimum {min}, Maximum {max})",
      addReviewerButtonText: "Add Reviewer",
      externalReviewerInfoMessage: "Invite your reviewers to give feedback on your leadership habit.",
      sliderInstruction: "Drag the circle to the left or right to provide your assessment of the habit.",
      reportYouLabel: "Baseline",
    },
  };
  add("assessment_definitions_v2", {
    id: defId,
    assessment_type_id: TYPE_PULSE.id,
    name: "Habit Accelerator",
    description: "Four-step habit journey with reviewer feedback on a 1–7 scale and an optional self-reflection round.",
    is_system: false,
    base_assessment_id: null,
    created_at: ts(-90),
    updated_at: ts(-90),
    min_nominees: 2,
    max_nominees: 5,
    allow_internal_nominees: true,
    allow_external_nominees: false,
    config,
  });

  // ------------------------------------------------------------ steps + questions
  const STEPS = [
    { key: "plan", phase: 1, title: "Define your new leadership habit" },
    { key: "observe", phase: 1, title: "Describe observable actions and their context" },
    { key: "nominate", phase: 1, title: "Nominate your reviewers" },
    { key: "results", phase: 1, title: "Review your feedback" },
    { key: "reflection", phase: 2, title: "Complete your reflection questions" },
    { key: "feedback", phase: 2, title: "Send out for feedback" },
    { key: "phase2_results", phase: 2, title: "Review the final feedback" },
  ];
  const stepId = {};
  STEPS.forEach((s, i) => {
    stepId[s.key] = add("assessment_steps_v2", {
      id: uid(`habit:step:${s.key}`),
      assessment_definition_id: defId,
      step_order: i + 1,
      title: s.title,
      step_key: s.key,
      phase_number: s.phase,
      created_at: ts(-90),
    }).id;
  });

  const NOMINATE_PROMPT =
    "Choose {min}–{max} colleagues (e.g., direct reports, peers, your manager, others) who will observe you in action and can give you diverse, constructive feedback.";
  const QUESTIONS = [
    // Phase 1 — participant
    { step: "plan", key: "plan_commitment", type: "textarea", required: true, context: "participant",
      text: "What is the habit your rider aims to change that you identified in Module 1?",
      extra: { maxLength: 600, tooltip: "Define the leadership habit you want to change. This will not be shared with reviewers." } },
    { step: "observe", key: "observe_actions", type: "textarea", required: true, context: "participant",
      text: "Which visible actions are you going to change to build this habit, when and with whom?",
      extra: { maxLength: 600, sharedWithReviewers: true, tooltip: "Describe the visible actions you will change. This will be shared with reviewers." } },
    { step: "nominate", key: "nominate_prompt", type: "heading", required: false, context: "participant",
      text: NOMINATE_PROMPT, extra: { tooltip: "Select colleagues who can observe your actions and provide feedback." } },
    // Phase 1 — reviewers (one set, on the results step)
    { step: "results", key: "reviewer_header", type: "heading", required: false, context: "reviewer",
      text: "<b>{participant_name}'s leadership habit</b><br>“{t1_commitment}”" },
    { step: "results", key: "reviewer_rating", type: "slider", required: true, context: "reviewer",
      text: "<b>1. What you observe:</b> {participant_name} committed to: “{t1_commitment}”. In your view, to what extent are they demonstrating this habit?" },
    { step: "results", key: "reviewer_suggestion", type: "textarea", required: true, context: "reviewer",
      text: "<b>2. One practical suggestion:</b> What is one concrete action you would suggest to help {participant_name} further strengthen this leadership habit?",
      extra: { maxLength: 2000 } },
    // Phase 2 — self-reflection (used in milestone B)
    { step: "reflection", key: "reflection_heading", type: "heading", required: false, context: "self_reflection",
      text: "Step Five: <b>Complete your reflection questions.</b>" },
    { step: "reflection", key: "reflection_slider", type: "slider", required: true, context: "self_reflection",
      text: "<b>1. Visibility of actions:</b> You said you were going to {t1_commitment}. In your view, to what extent are you doing it?" },
    { step: "reflection", key: "reflection_text", type: "textarea", required: true, context: "self_reflection",
      text: "<b>2. One area of improvement:</b> What next steps will you take to further strengthen this leadership habit?",
      extra: { maxLength: 2000, placeholder: "I will try harder to reach these milestones." } },
    { step: "feedback", key: "feedback_prompt", type: "heading", required: false, context: "self_reflection",
      text: `Step Six: <b>Send out for feedback</b><br>${NOMINATE_PROMPT}` },
  ];
  const q = {};
  const orderInStep = {};
  for (const item of QUESTIONS) {
    orderInStep[item.step] = (orderInStep[item.step] ?? 0) + 1;
    q[item.key] = add("assessment_questions_v2", {
      id: uid(`habit:question:${item.key}`),
      assessment_definition_id: defId,
      step_id: stepId[item.step],
      question_order: orderInStep[item.step],
      question_text: item.text,
      question_type: item.type,
      required: item.required,
      config: { key: item.key, context: item.context, ...(item.extra ?? {}) },
      created_at: ts(-90),
    }).id;
  }

  // ------------------------------------------------------------ plan
  const plan = add("plans", {
    id: uid("habit:plan"),
    name: "Habit Accelerator",
    description: `Define one leadership habit, gather reviewer feedback, then reflect.\n<!--PLAN_ASSESSMENT_DEFINITIONS:${JSON.stringify({ [TYPE_PULSE.id]: defId })}-->`,
    created_at: ts(-90),
  });
  add("plan_assessments", { id: uid("habit:plan-assessment"), plan_id: plan.id, assessment_type_id: TYPE_PULSE.id });

  // ------------------------------------------------------------ cohort
  const START = -21;
  const END = 40;
  const cohortId = uid("habit:cohort");
  add("cohorts", {
    id: cohortId,
    client_id: client.id,
    name: "Habit Accelerator — Spring Cohort",
    plan_id: plan.id,
    start_date: date(START),
    end_date: date(END),
    status: "active",
    created_by: admin?.id ?? null,
    created_at: ts(START - 10),
  });
  const caId = uid("habit:cohort-assessment");
  add("cohort_assessments", {
    id: caId,
    cohort_id: cohortId,
    assessment_type_id: TYPE_PULSE.id,
    name: "Habit Accelerator",
    start_date: date(START),
    end_date: date(END),
    created_at: ts(START - 10, 5),
    assessment_status: "In Progress",
    template_version_id: null,
    assessment_definition_id: defId,
  });
  const phase1 = add("cohort_assessment_phases", {
    id: uid("habit:phase:1"),
    cohort_assessment_id: caId,
    phase_number: 1,
    name: "T1",
    start_date: date(START),
    end_date: null,
    created_at: ts(START - 10, 6),
  });

  // ------------------------------------------------------------ people
  const pool = users.filter((u) => u.role === "participant");
  const participants = PROFILES.map((p, i) => ({ ...p, user: pool[i] }));
  const reviewerPool = pool.slice(PROFILES.length); // colleagues who review but aren't in the cohort


  // ------------------------------------------------------------ journeys
  const { demo } = seedJourneys(h, {
    prefix: "habit",
    caId,
    defId,
    phaseId: phase1.id,
    start: START,
    q,
    stepId,
    reviewerPool,
    entries: participants.map((p) => {
      const cpId = uid(`habit:cp:${p.id}`);
      add("cohort_participants", {
        id: cpId,
        cohort_id: cohortId,
        client_user_id: p.user.id,
        status: p.answers === 0 ? "invited" : "active",
      });
      return { profile: p, user: p.user, cpId };
    }),
  });

  // A pending review request P1 can accept as a reviewer, so the demo shows both sides.
  const p4 = participants[3];
  const p1 = participants[0];
  const crossNom = uid("habit:nomination:p4-by-p1");
  add("reviewer_nominations", {
    id: crossNom,
    participant_assessment_id: uid("habit:pa:p4"),
    nominated_by_id: p4.user.id,
    reviewer_id: p1.user.id,
    review_submitted_at: null,
    created_at: ts(-2, 10),
    request_status: "pending",
    is_external: false,
    external_reviewer_id: null,
    review_status: null,
  });
  add("reviewer_round_invitations", {
    id: uid(`habit:invitation:${crossNom}:1`),
    reviewer_nomination_id: crossNom,
    phase_id: phase1.id,
    status: "sent",
    sent_at: ts(-2, 10),
    completed_at: null,
    created_at: ts(-2, 10),
  });

  return {
    cohortName: "Habit Accelerator — Spring Cohort",
    participant: demo.participant,
    reviewer: demo.openReviewer,
    notEnough: participants[1].user,
    notSubmitted: participants[2].user,
  };
}

/**
 * Phase-1 journeys for a habit-journey cohort assessment: participant answers,
 * submissions, nominations, per-round invitations and reviewer slider +
 * suggestion responses, following each entry's profile. Ids derive from
 * `prefix`, so re-running with the same prefix replaces rather than duplicates.
 */
export function seedJourneys(h, { prefix, caId, defId, phaseId, start, q, stepId, reviewerPool, entries }) {
  const { uid, add, ts, between, pick } = h;
  const START = start;
  const phase1 = { id: phaseId };
  let reviewerCursor = 0;
  const nextReviewer = () => reviewerPool[reviewerCursor++ % reviewerPool.length];
  const demo = { participant: entries[0]?.user, openReviewer: null };

  entries.forEach(({ profile: p, cpId, user }, i) => {
    const submitted = p.answers >= 2;
    if (p.answers === 0) return; // not started: no assessment row yet

    const paId = uid(`${prefix}:pa:${p.id}`);
    const startOffset = START + 1 + i;
    const submitOffset = startOffset + between(1, 3);
    add("participant_assessments", {
      id: paId,
      cohort_assessment_id: caId,
      participant_id: cpId,
      status: submitted ? "Completed" : "In Progress",
      score: null,
      submitted_at: submitted ? ts(submitOffset, 120) : null,
      allow_reviewer_nominations: true,
      created_at: ts(startOffset, 60),
    });

    // Participant's own answers (steps 1–2)
    const sessionId = uid(`${prefix}:session:self:${p.id}`);
    add("assessment_response_sessions", {
      id: sessionId,
      participant_assessment_id: paId,
      assessment_definition_id: defId,
      reviewer_nomination_id: null,
      respondent_type: "participant",
      respondent_client_user_id: user.id,
      respondent_external_reviewer_id: null,
      status: submitted ? "completed" : "in_progress",
      started_at: ts(startOffset, 60),
      submitted_at: submitted ? ts(submitOffset, 120) : null,
      last_step_id: submitted ? stepId.observe : stepId.plan,
      last_question_id: submitted ? q.observe_actions : q.plan_commitment,
      completion_percent: submitted ? 100 : 50,
      phase: 1,
      created_at: ts(startOffset, 60),
      updated_at: ts(submitted ? submitOffset : startOffset, 120),
    });
    const [habit, actions] = HABITS[i % HABITS.length];
    const answers = [[q.plan_commitment, habit], [q.observe_actions, actions]].slice(0, p.answers);
    for (const [questionId, text] of answers) {
      add("assessment_responses", {
        id: uid(`${prefix}:response:${sessionId}:${questionId}`),
        session_id: sessionId,
        question_id: questionId,
        answer_text: text,
        answer_json: null,
        is_answered: true,
        created_at: ts(startOffset, 90),
        updated_at: ts(startOffset, 90),
      });
    }

    // Nominations, invitations and reviews
    p.reviews.forEach((state, k) => {
      const reviewer = nextReviewer();
      if (!reviewer) return;
      const nomId = uid(`${prefix}:nomination:${p.id}:${k}`);
      const nominatedAt = submitOffset + 1;
      const request = state === "pending" ? "pending" : state === "rejected" ? "rejected" : "accepted";
      const review = request !== "accepted" ? null : state === "accepted" ? "Not started" : state;
      const done = review === "Completed";
      const reviewedAt = done ? Math.min(-1, nominatedAt + between(2, 8)) : null;
      add("reviewer_nominations", {
        id: nomId,
        participant_assessment_id: paId,
        nominated_by_id: user.id,
        reviewer_id: reviewer.id,
        review_submitted_at: done ? ts(reviewedAt, 200) : null,
        created_at: ts(nominatedAt, 30 + k),
        request_status: request,
        is_external: false,
        external_reviewer_id: null,
        review_status: review,
      });
      add("reviewer_round_invitations", {
        id: uid(`${prefix}:invitation:${nomId}:1`),
        reviewer_nomination_id: nomId,
        phase_id: phase1.id,
        status: done ? "completed" : request === "rejected" ? "declined" : review === "In progress" ? "opened" : "sent",
        sent_at: ts(nominatedAt, 30 + k),
        completed_at: done ? ts(reviewedAt, 200) : null,
        created_at: ts(nominatedAt, 30 + k),
      });
      if (i === 0 && state === "accepted") demo.openReviewer = reviewer;

      if (review === "Completed" || review === "In progress") {
        const rs = uid(`${prefix}:session:review:${nomId}`);
        add("assessment_response_sessions", {
          id: rs,
          participant_assessment_id: paId,
          assessment_definition_id: defId,
          reviewer_nomination_id: nomId,
          respondent_type: "client_user",
          respondent_client_user_id: reviewer.id,
          respondent_external_reviewer_id: null,
          status: done ? "completed" : "in_progress",
          started_at: ts(nominatedAt + 1, 60),
          submitted_at: done ? ts(reviewedAt, 200) : null,
          last_step_id: stepId.results,
          last_question_id: done ? q.reviewer_suggestion : q.reviewer_rating,
          completion_percent: done ? 100 : 50,
          phase: 1,
          created_at: ts(nominatedAt + 1, 60),
          updated_at: ts(done ? reviewedAt : nominatedAt + 1, 200),
        });
        const rating = between(3, 7);
        add("assessment_responses", {
          id: uid(`${prefix}:response:${rs}:rating`),
          session_id: rs,
          question_id: q.reviewer_rating,
          answer_text: String(rating),
          answer_json: rating,
          is_answered: true,
          created_at: ts(nominatedAt + 1, 70),
          updated_at: ts(nominatedAt + 1, 70),
        });
        if (done) {
          add("assessment_responses", {
            id: uid(`${prefix}:response:${rs}:suggestion`),
            session_id: rs,
            question_id: q.reviewer_suggestion,
            answer_text: pick(SUGGESTIONS),
            answer_json: null,
            is_answered: true,
            created_at: ts(reviewedAt, 190),
            updated_at: ts(reviewedAt, 190),
          });
        }
      }
    });
  });

  return { demo };
}
