import {
  onboardingStepsCopy,
  splitCompanyProgress,
  unitLabel,
  type OnboardingStep,
  type StepWork,
} from '@transport/shared';

import { ownerProgress, type CompanyContext } from './fleet-api';
import type { OwnerDocuments } from './owner-documents-api';

// Steps 3–5 of the sign-up in the app (D42, plan-registro.md R3): what each
// step of a Gerente, a hombre-camión or an operator holds, from the documents
// the screens already read. The rules (which step, what is missing) are
// @transport/shared's onboarding.ts, the same as the web's.

type Progress = ReturnType<typeof ownerProgress>;

/** A group of documents in "En verificación" and the step where they are sent. */
export interface StatusGroup {
  key: string;
  title: string;
  step: OnboardingStep;
  progress: Progress;
}

export interface CarrierOnboarding {
  work: StepWork;
  groups: StatusGroup[];
}

/**
 * The Gerente's and the hombre-camión's steps: step 3 holds the common
 * company documents, step 4 the rest of the company's and, for the
 * hombre-camión (D13), his trucks' and his own as their operator. A
 * hombre-camión without a truck or without his operator row is missing them.
 */
export function carrierOnboarding(
  data: Pick<OwnerDocuments, 'context' | 'operatorId' | 'vehicles'>,
  ownerOperator: boolean,
): CarrierOnboarding {
  const { context } = data;
  const s = onboardingStepsCopy;
  const { common, own } = splitCompanyProgress(
    ownerProgress(context, { type: 'company', id: context.company.id }),
  );
  const groups: StatusGroup[] = [
    { key: 'common', title: s.titles.documents, step: 'documents', progress: common },
  ];
  if (own.length > 0) {
    groups.push({ key: 'own', title: s.groups.company, step: 'profile', progress: own });
  }
  if (!ownerOperator) {
    return { work: { documents: common, profile: own }, groups };
  }
  const vehicles = data.vehicles.map((vehicle) => ({
    key: vehicle.id,
    title: `${s.groups.units}: ${unitLabel(vehicle)}`,
    step: 'profile' as const,
    progress: ownerProgress(context, { type: 'vehicle', id: vehicle.id }),
  }));
  const operator = data.operatorId
    ? ownerProgress(context, { type: 'operator', id: data.operatorId })
    : null;
  groups.push(...vehicles);
  if (operator) {
    groups.push({ key: 'operator', title: s.groups.personal, step: 'profile', progress: operator });
  }
  return {
    work: {
      documents: common,
      profile: [...own, ...vehicles.flatMap((v) => v.progress), ...(operator ?? [])],
      profileExtras: (vehicles.length === 0 ? 1 : 0) + (operator ? 0 : 1),
    },
    groups,
  };
}

/** The operator's own steps (D43): their documents are step 4. */
export function operatorOnboarding(context: CompanyContext, operatorId: string): CarrierOnboarding {
  const progress = ownerProgress(context, { type: 'operator', id: operatorId });
  return {
    work: { documents: [], profile: progress },
    groups: [
      {
        key: 'operator',
        title: onboardingStepsCopy.groups.personal,
        step: 'profile',
        progress,
      },
    ],
  };
}
