"use client";

import { Building2, FileText, Users, ClipboardList, ArrowRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SettingsOnboardingStep } from "./steps";

interface IllustrationProps {
  className?: string;
}

export function OverviewFlowIllustration({ className }: IllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-6", className)}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Clients</span>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Plans</span>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Cohorts</span>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <ClipboardList className="h-8 w-8 text-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Assessments</span>
        </div>
      </div>
    </div>
  );
}

export function PlansBlueprintIllustration({ className }: IllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-6", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
          <FileText className="h-10 w-10 text-primary" />
        </div>
        <span className="text-sm font-medium">Plan</span>
        <div className="flex gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
        <div className="flex gap-3 mt-2">
          <div className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded bg-muted border" />
            <span className="text-xs text-muted-foreground">Assessment</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded bg-muted border" />
            <span className="text-xs text-muted-foreground">Assessment</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssessmentsForkIllustration({ className }: IllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-6", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted border-2">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium">System Assessment</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-muted-foreground" />
          <div className="h-px w-8 bg-muted-foreground rotate-45 origin-left" />
          <div className="h-px w-8 bg-muted-foreground -rotate-45 origin-left" />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
              <ClipboardList className="h-7 w-7 text-primary" />
            </div>
            <span className="text-xs font-medium">Custom</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
              <ClipboardList className="h-7 w-7 text-primary" />
            </div>
            <span className="text-xs font-medium">Custom</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CohortsLiveIllustration({ className }: IllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-6", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
          <Users className="h-10 w-10 text-primary" />
        </div>
        <span className="text-sm font-medium">Cohort</span>
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30" />
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30" />
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30" />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>In Progress</span>
        </div>
      </div>
    </div>
  );
}

export function ControlPanelIllustration({ className }: IllustrationProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 p-6", className)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
          <Settings className="h-10 w-10 text-primary" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 w-8 rounded bg-muted border" />
          <div className="h-8 w-8 rounded bg-muted border" />
          <div className="h-8 w-8 rounded bg-muted border" />
          <div className="h-8 w-8 rounded bg-muted border" />
        </div>
      </div>
    </div>
  );
}

export function OnboardingIllustration({
  illustrationKey,
  className,
}: {
  illustrationKey: "overview-flow" | "plans-blueprint" | "assessments-fork" | "cohorts-live" | "control-panel";
  className?: string;
}) {
  switch (illustrationKey) {
    case "overview-flow":
      return <OverviewFlowIllustration className={className} />;
    case "plans-blueprint":
      return <PlansBlueprintIllustration className={className} />;
    case "assessments-fork":
      return <AssessmentsForkIllustration className={className} />;
    case "cohorts-live":
      return <CohortsLiveIllustration className={className} />;
    case "control-panel":
      return <ControlPanelIllustration className={className} />;
    default:
      return null;
  }
}

