"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { FormStepper } from "@/components/forms/FormStepper";
import { Step1Basics, Step1Data } from "@/components/forms/Step1Basics";
import { Step2Location, Step2Data } from "@/components/forms/Step2Location";
import { Step3TypeSpecific } from "@/components/forms/Step3TypeSpecific";
import { Step4Safety, Step4Data } from "@/components/forms/Step4Safety";
import { Step5Review } from "@/components/forms/Step5Review";
import { SupportedPermitType } from "@/lib/permit-schemas";
import { api } from "@/lib/api/client";
import { Edit, AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditDraftPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(1);
  const maxAccessibleStep = 5;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formatForInput = (d: string | Date | null | undefined) => {
    if (!d) return "";
    const date = new Date(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  const [step1, setStep1] = useState<Step1Data>({
    type: "HOT_WORK",
    contractorTeam: "",
    workDescription: "",
    plannedStartTime: "",
    plannedEndTime: "",
  });

  const [step2, setStep2] = useState<Step2Data>({
    plantId: "",
    areaId: "",
    equipmentId: "",
  });

  const [typeData, setTypeData] = useState<Record<string, unknown>>({});

  const [step4, setStep4] = useState<Step4Data>({
    hazards: [],
    ppeRequired: [],
    precautionsChecklist: {},
  });

  // Load existing permit
  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        setLoading(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await api.get<{ data: any }>(`/api/permits/${id}`);
        const p = res.data;

        if (cancelled) return;

        if (p.status !== "DRAFT") {
          setLoadError(
            `Permit ${p.permitNumber} is currently in "${p.status}" status. Post-submission core field mutation is prohibited.`
          );
          setLoading(false);
          return;
        }

        if (user && p.requesterId !== user.id) {
          setLoadError(
            `Unauthorized: Only the original requester (${p.requester?.name || p.requesterId}) may edit this draft.`
          );
          setLoading(false);
          return;
        }

        setStep1({
          type: p.type as SupportedPermitType,
          contractorTeam: p.contractorTeam || "",
          workDescription: p.workDescription || "",
          plannedStartTime: formatForInput(p.plannedStartTime),
          plannedEndTime: formatForInput(p.plannedEndTime),
        });

        setStep2({
          plantId: p.equipment?.area?.plantId || "",
          areaId: p.equipment?.areaId || "",
          equipmentId: p.equipmentId || "",
        });

        setTypeData((p.typeData as Record<string, unknown>) || {});

        setStep4({
          hazards: (p.hazards as string[]) || [],
          ppeRequired: (p.ppeRequired as string[]) || [],
          precautionsChecklist: (p.precautionsChecklist as Record<string, boolean>) || {},
        });

        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load permit.");
          setLoading(false);
        }
      }
    }

    loadDraft();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const steps = [
    { id: 1, title: "1. Basics", description: "Type, Scope & Schedule" },
    { id: 2, title: "2. Location", description: "Plant & Equipment Hierarchy" },
    { id: 3, title: "3. Specifications", description: "Regulatory Safety Data" },
    { id: 4, title: "4. Hazards & PPE", description: "Controls & Precautions" },
    { id: 5, title: "5. Review & Save", description: "Save or Submit" },
  ];

  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        equipmentId: step2.equipmentId,
        contractorTeam: step1.contractorTeam,
        workDescription: step1.workDescription,
        plannedStartTime: new Date(step1.plannedStartTime).toISOString(),
        plannedEndTime: new Date(step1.plannedEndTime).toISOString(),
        hazards: step4.hazards,
        ppeRequired: step4.ppeRequired,
        precautionsChecklist: step4.precautionsChecklist,
        typeData,
      };

      await api.patch(`/api/permits/${id}`, payload);
      router.push(`/permits/${id}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        equipmentId: step2.equipmentId,
        contractorTeam: step1.contractorTeam,
        workDescription: step1.workDescription,
        plannedStartTime: new Date(step1.plannedStartTime).toISOString(),
        plannedEndTime: new Date(step1.plannedEndTime).toISOString(),
        hazards: step4.hazards,
        ppeRequired: step4.ppeRequired,
        precautionsChecklist: step4.precautionsChecklist,
        typeData,
      };

      // 1. Update draft
      await api.patch(`/api/permits/${id}`, payload);

      // 2. Submit for approval
      await api.post(`/api/permits/${id}/submit`);

      router.push(`/permits/${id}`);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit permit for approval."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center p-12">
          <Loader2 className="animate-spin text-zinc-600 dark:text-zinc-400" size={32} />
          <p className="text-xs font-semibold text-zinc-500 mt-2">Loading permit draft...</p>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto mt-8 p-6 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-600 shrink-0" size={24} />
            <div>
              <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                Draft Editing Blocked
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">{loadError}</p>
              <div className="mt-4">
                <Link
                  href={`/permits/${id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold shadow-xs"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Permit View</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Edit size={22} className="text-zinc-700 dark:text-zinc-300" />
            <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
              Edit Draft Permit
            </h1>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Modify scope, equipment, or safety controls prior to formal approval submission.
          </p>
        </div>

        {/* Progress Stepper */}
        <FormStepper
          steps={steps}
          currentStep={currentStep}
          onStepClick={(stepId) => setCurrentStep(stepId)}
          maxAccessibleStep={maxAccessibleStep}
        />

        {/* Form Container */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
          {currentStep === 1 && (
            <Step1Basics
              data={step1}
              onChange={(patch) => setStep1((prev) => ({ ...prev, ...patch }))}
              onNext={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 2 && (
            <Step2Location
              data={step2}
              onChange={(patch) => setStep2((prev) => ({ ...prev, ...patch }))}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <Step3TypeSpecific
              type={step1.type}
              typeData={typeData}
              onChange={(data) => setTypeData(data)}
              onNext={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && (
            <Step4Safety
              data={step4}
              onChange={(patch) => setStep4((prev) => ({ ...prev, ...patch }))}
              onNext={() => setCurrentStep(5)}
              onBack={() => setCurrentStep(3)}
            />
          )}

          {currentStep === 5 && (
            <Step5Review
              formData={{
                ...step1,
                ...step2,
                ...step4,
                typeData,
              }}
              onBack={() => setCurrentStep(4)}
              onSaveDraft={handleSaveDraft}
              onSubmitForApproval={handleSubmitForApproval}
              isSubmitting={isSubmitting}
              submitError={submitError}
              isEditMode={true}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
