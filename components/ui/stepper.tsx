import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export interface StepperStep {
  title: string
  description?: string
  status?: "completed" | "active" | "pending"
  content?: React.ReactNode
}

export interface StepperProps {
  steps: StepperStep[]
  className?: string
}

const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  ({ steps, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col space-y-8", className)}
        {...props}
      >
        {steps.map((step, index) => {
          const isCompleted = step.status === "completed"
          const isActive = step.status === "active"
          const isPending = step.status === "pending" || (!step.status && !isCompleted && !isActive)

          return (
            <div key={index} className="flex gap-4">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                    {
                      "bg-primary border-primary text-primary-foreground": isCompleted || isActive,
                      "bg-background border-muted-foreground/30 text-muted-foreground": isPending,
                    }
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{index + 1}</span>
                  )}
                </div>
                {/* Connecting Line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 h-full min-h-8 mt-2 transition-colors",
                      {
                        "bg-primary": isCompleted,
                        "bg-muted-foreground/30": !isCompleted,
                      }
                    )}
                  />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 pb-8">
                <div
                  className={cn("transition-colors", {
                    "text-muted-foreground": isPending && !isActive,
                  })}
                >
                  <h3
                    className={cn("text-lg font-semibold mb-2", {
                      "text-foreground": isActive || isCompleted,
                      "text-muted-foreground": isPending,
                    })}
                  >
                    {step.title}
                  </h3>
                  {step.description && (
                    <p
                      className={cn("text-sm mb-4", {
                        "text-muted-foreground": isPending,
                      })}
                    >
                      {step.description}
                    </p>
                  )}
                  {step.content && (
                    <div className="mt-4">{step.content}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)
Stepper.displayName = "Stepper"

export { Stepper }

