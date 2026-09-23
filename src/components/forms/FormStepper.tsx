import React from "react";
import { Check } from "lucide-react";

interface Step {
  id: number;
  title: string;
  description: string;
}

interface FormStepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (stepId: number) => void;
  maxAccessibleStep?: number;
}

export function FormStepper({
  steps,
  currentStep,
  onStepClick,
  maxAccessibleStep = currentStep,
}: FormStepperProps) {
  return (
    <nav aria-label="Permit Creation Progress" className="mb-8">
      <ol className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
        {steps.map((step) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isClickable = onStepClick && step.id <= maxAccessibleStep;

          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isCurrent
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                    : isCompleted
                    ? "border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 hover:bg-emerald-100/60"
                    : "border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCurrent
                        ? "bg-amber-400 text-zinc-950 dark:bg-amber-500"
                        : isCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {isCompleted ? <Check size={12} strokeWidth={3} /> : step.id}
                  </span>
                  <span className="text-xs font-bold truncate">{step.title}</span>
                </div>
                <div
                  className={`text-[10px] truncate ${
                    isCurrent
                      ? "text-zinc-300 dark:text-zinc-600"
                      : isCompleted
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {step.description}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
