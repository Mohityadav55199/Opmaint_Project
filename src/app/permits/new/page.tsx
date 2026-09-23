"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { FormStepper } from "@/components/forms/FormStepper";
import { Step1Basics, Step1Data } from "@/components/forms/Step1Basics";
import { Step2Location, Step2Data } from "@/components/forms/Step2Location";
import { Step3TypeSpecific } from "@/components/forms/Step3TypeSpecific";
import { Step4Safety, Step4Data } from "@/components/forms/Step4Safety";
import { Step5Review } from "@/components/forms/Step5Review";
import { api } from "@/lib/api/client";
import { FilePlus } from "lucide-react";

export default function NewPermitPage() {
  const router = useRouter();

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000); // in 1 hour
  const defaultEnd = new Date(defaultStart.getTime() + 8 * 60 * 60 * 1000); // 8-hour shift

  const formatForInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [maxAccessibleStep, setMaxAccessibleStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form State
  const [step1, setStep1] = useState<Step1Data>({
    type: "HOT_WORK",
    contractorTeam: "Apex Industrial Maintenance Team",
    workDescription: "Hot work cutting and welding on structural support bracket.",
    plannedStartTime: formatForInput(defaultStart),
    plannedEndTime: formatForInput(defaultEnd),
  });

  const [step2, setStep2] = useState<Step2Data>({
    plantId: "",
    areaId: "",
    equipmentId: "",
  });

  const [typeData, setTypeData] = useState<Record<string, unknown>>({
    hotWorkType: "WELDING",
    fireWatchName: "Sunil Verma",
    fireExtinguisherType: "CO2 4.5kg + DCP 6kg",
    combustiblesClearedRadiusMetres: 10,
    gasTestLelPercent: 0,
    gasTestO2Percent: 20.9,
    gasTestTime: new Date().toISOString(),
    gasTesterName: "Rajesh Kulkarni",
  });

  const [step4, setStep4] = useState<Step4Data>({
    hazards: ["Flammable Vapor / Gas Accumulation", "Sparks, Hot Slag & Heat Radiation"],
    ppeRequired: [
      "Hard Hat / Industrial Safety Helmet",
      "Steel-Toe Impact Boots",
      "Safety Glasses with Side Shields",
      "Heavy Leather Welding Gauntlets",
    ],
    precautionsChecklist: {
      toolbox_talk: true,
      emergency_stop: true,
      area_barricaded: true,
      communications_checked: true,
      housekeeping_arranged: true,
    },
  });

  const steps = [
    { id: 1, title: "1. Basics", description: "Type, Scope & Schedule" },
    { id: 2, title: "2. Location", description: "Plant & Equipment Hierarchy" },
    { id: 3, title: "3. Specifications", description: "Regulatory Safety Data" },
    { id: 4, title: "4. Hazards & PPE", description: "Controls & Precautions" },
    { id: 5, title: "5. Review & Submit", description: "Authorize or Save Draft" },
  ];

  const handleStep1Change = (patch: Partial<Step1Data>) => {
    // If permit type changes, update sensible default type data
    if (patch.type && patch.type !== step1.type) {
      if (patch.type === "HOT_WORK") {
        setTypeData({
          hotWorkType: "WELDING",
          fireWatchName: "Sunil Verma",
          fireExtinguisherType: "CO2 4.5kg + DCP 6kg",
          combustiblesClearedRadiusMetres: 10,
          gasTestLelPercent: 0,
          gasTestO2Percent: 20.9,
          gasTestTime: new Date().toISOString(),
          gasTesterName: "Rajesh Kulkarni",
        });
      } else if (patch.type === "CONFINED_SPACE_ENTRY") {
        setTypeData({
          spaceId: "TANK-TK-101",
          entryPoint: "Top Inspection Manway MW-1",
          standbyAttendantName: "Sunil Verma",
          rescuePlanDescription: "Tripod winch mounted over manhole; harness worn; direct radio comms with plant fire team.",
          ventilationMethod: "FORCED_MECHANICAL",
          gasTestO2Percent: 20.9,
          gasTestLelPercent: 0,
          gasTestH2sPpm: 0,
          gasTestCoPpm: 0,
          gasTestTime: new Date().toISOString(),
          gasTesterName: "Rajesh Kulkarni",
          communicationMethod: "Two-Way UHF Intrinsically Safe Radio",
        });
      } else if (patch.type === "WORKING_AT_HEIGHT") {
        setTypeData({
          heightMetres: 4.5,
          accessMethod: "SCAFFOLD",
          fallArrestEquipment: "EN 361 Full Body Harness with Twin Shock-Absorbing Lanyards",
          anchorPointChecked: true,
          barricadingBelow: true,
          rescuePlanAtHeight: "Dedicated rescue pole with rope kit and ground rescue team on standby.",
          weatherCheckConfirmed: true,
        });
      } else if (patch.type === "ELECTRICAL_ISOLATION_LOTO") {
        setTypeData({
          equipmentTag: "MCC-04-FEEDER-02",
          voltageLevel: "415V / 3-Phase",
          isolationPointsList: ["Main Circuit Breaker CB-104", "Local Isolator SW-02"],
          lockNumbers: ["LOCK-A401", "LOCK-A402"],
          tagNumbers: ["TAG-901", "TAG-902"],
          earthingApplied: true,
          testedDeadBy: "Arjun Nair (Chief Electrician)",
          testInstrumentUsed: "Fluke T6-1000 Proved Tester (Calibrated)",
          zeroEnergyVerified: true,
        });
      }
    }
    setStep1((prev) => ({ ...prev, ...patch }));
  };

  const goToNext = (targetStep: number) => {
    setCurrentStep(targetStep);
    if (targetStep > maxAccessibleStep) {
      setMaxAccessibleStep(targetStep);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        type: step1.type,
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

      const res = await api.post<{ data: { id: string } }>("/api/permits", payload);
      router.push(`/permits/${res.data.id}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create permit draft.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        type: step1.type,
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

      // 1. Create DRAFT
      const created = await api.post<{ data: { id: string } }>("/api/permits", payload);

      // 2. Submit for Approval
      await api.post(`/api/permits/${created.data.id}/submit`);

      router.push(`/permits/${created.data.id}`);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to submit permit for approval. Please check inputs."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <FilePlus size={22} className="text-zinc-700 dark:text-zinc-300" />
            <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
              Create Work Permit (PTW)
            </h1>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Step-by-step risk assessment, location validation, and multi-disciplinary safety sign-off.
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
              onChange={handleStep1Change}
              onNext={() => goToNext(2)}
            />
          )}

          {currentStep === 2 && (
            <Step2Location
              data={step2}
              onChange={(patch) => setStep2((prev) => ({ ...prev, ...patch }))}
              onNext={() => goToNext(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <Step3TypeSpecific
              type={step1.type}
              typeData={typeData}
              onChange={(data) => setTypeData(data)}
              onNext={() => goToNext(4)}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {currentStep === 4 && (
            <Step4Safety
              data={step4}
              onChange={(patch) => setStep4((prev) => ({ ...prev, ...patch }))}
              onNext={() => goToNext(5)}
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
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
