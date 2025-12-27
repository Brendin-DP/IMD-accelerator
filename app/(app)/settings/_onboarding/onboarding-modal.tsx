"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SETTINGS_ONBOARDING_STEPS, type SettingsOnboardingStep } from "./steps";
import { OnboardingIllustration } from "./illustrations";

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function OnboardingModal({ open, onOpenChange, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = SETTINGS_ONBOARDING_STEPS[currentStep];
  const totalSteps = SETTINGS_ONBOARDING_STEPS.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
    onOpenChange(false);
  };

  const handleFinish = () => {
    onComplete();
    onOpenChange(false);
  };

  // Reset to first step when modal opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Only allow closing via explicit actions (skip/finish/close button)
      // Prevent accidental dismissal via backdrop click
      if (!newOpen) {
        // User clicked backdrop or ESC - treat as skip
        handleSkip();
      }
    }}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col">
        <DialogClose onClick={handleSkip} />
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Left 40% - Illustration */}
          <div className="w-full md:w-[40%] bg-muted/30 border-r border-border flex items-center justify-center p-6 min-h-[200px] md:min-h-0">
            <OnboardingIllustration illustrationKey={step.illustration.key} />
          </div>

          {/* Right 60% - Content */}
          <div className="w-full md:w-[60%] p-6 flex flex-col min-h-0 overflow-y-auto justify-center">
            <div className="w-full">
              <DialogHeader>
                <DialogTitle className="text-2xl">{step.title}</DialogTitle>
              </DialogHeader>

              <div className="flex-1 space-y-4 mt-4">
                <ul className="space-y-3">
                  {step.body.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="text-primary mt-0.5 font-bold">•</span>
                      <span className="text-sm text-foreground leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>

                {step.tip && (
                  <div className="mt-6 p-3 bg-primary/5 border border-primary/20 rounded-md">
                    <p className="text-xs font-medium text-primary">💡 {step.tip}</p>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t flex-shrink-0">
                <div className="text-xs text-muted-foreground">
                  Step {currentStep + 1} of {totalSteps}
                </div>
                <div className="flex items-center gap-2">
                  {step.secondaryCta && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (step.secondaryCta?.action === "back") {
                          handleBack();
                        } else {
                          handleSkip();
                        }
                      }}
                      disabled={step.secondaryCta.action === "back" && currentStep === 0}
                    >
                      {step.secondaryCta.label}
                    </Button>
                  )}
                  {step.primaryCta && (
                    <Button
                      onClick={() => {
                        if (step.primaryCta.action === "finish") {
                          handleFinish();
                        } else {
                          handleNext();
                        }
                      }}
                    >
                      {step.primaryCta.label}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

