export type SettingsOnboardingStep = {
  id: string;
  title: string;
  body: string[];
  tip?: string;

  // For the left 40% panel — you can map this to an illustration component
  illustration: {
    key:
      | "overview-flow"
      | "plans-blueprint"
      | "assessments-fork"
      | "cohorts-live"
      | "control-panel";
    alt: string;
  };

  // Optional actions per step (labels only — you handle behaviour)
  primaryCta?: { label: string; action: "next" | "finish" };
  secondaryCta?: { label: string; action: "skip" | "back" };
};

export const SETTINGS_ONBOARDING_STEPS: SettingsOnboardingStep[] = [
  {
    id: "overview",
    title: "Welcome to Settings",
    body: [
      "Clients are organisations you work with.",
      "Plans define what gets assessed.",
      "Cohorts apply a plan to a real group of people.",
      "Assessments power the questions and structure.",
    ],
    tip: "If you remember one thing: Plans → Cohorts → People → Responses.",
    illustration: {
      key: "overview-flow",
      alt: "Flow diagram showing Clients → Plans → Cohorts → Assessments",
    },
    primaryCta: { label: "Next", action: "next" },
    secondaryCta: { label: "Skip", action: "skip" },
  },
  {
    id: "plans",
    title: "Start with Plans",
    body: [
      "A Plan is a reusable blueprint for a cohort.",
      "A plan can include one or multiple assessment types.",
      "You can create a few plans and reuse them across clients and cohorts.",
    ],
    tip: "Think of a plan as a curriculum, not a schedule.",
    illustration: {
      key: "plans-blueprint",
      alt: "Plan card connected to multiple assessment tiles",
    },
    primaryCta: { label: "Next", action: "next" },
    secondaryCta: { label: "Back", action: "back" },
  },
  {
    id: "assessments",
    title: "Assessments control the questions",
    body: [
      "You'll see System Assessments (read-only).",
      "You can create Custom Assessments based on a system base.",
      "Custom assessments can be edited: add / remove / reorder questions (and steps where relevant).",
    ],
    tip: "You're never overwriting the system — you're forking it.",
    illustration: {
      key: "assessments-fork",
      alt: "System assessment branching into a custom editable assessment",
    },
    primaryCta: { label: "Next", action: "next" },
    secondaryCta: { label: "Back", action: "back" },
  },
  {
    id: "cohorts",
    title: "Cohorts are where delivery happens",
    body: [
      "A Cohort links a client to a plan and a time window.",
      "Participants are invited into the cohort.",
      "This is where assessment progress and responses get created.",
    ],
    tip: "Cohorts are your \"live runs\" of a plan.",
    illustration: {
      key: "cohorts-live",
      alt: "Cohort with participants and assessments in progress",
    },
    primaryCta: { label: "Next", action: "next" },
    secondaryCta: { label: "Back", action: "back" },
  },
  {
    id: "wrap",
    title: "You can always come back",
    body: [
      "Use Settings to manage the foundation: clients, plans, assessments.",
      "If you forget something, click Learn more anytime.",
      "You don't need to set everything up perfectly — start simple and iterate.",
    ],
    illustration: {
      key: "control-panel",
      alt: "Control panel illustration representing admin control",
    },
    primaryCta: { label: "Start managing settings", action: "finish" },
    secondaryCta: { label: "Skip for now", action: "skip" },
  },
];

