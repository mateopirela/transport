import {
  adjacentOnboardingSteps,
  currentOnboardingStep,
  onboardingStepsCopy as copy,
  type OnboardingStep,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

import { DocumentList } from '../../components/document-list';
import { OnboardingStatus, OnboardingStepsBar } from '../../components/onboarding-steps';
import { TabBottomBar } from '../../components/tab-bottom-bar';
import { Footnote, LoadError, Notice, Screen, Skeleton } from '../../components/ui';
import { operatorOnboarding } from '../../lib/onboarding';
import { loadOperatorDocuments } from '../../lib/operator-documents-api';
import { supabase } from '../../lib/supabase';
import { useLoader } from '../../lib/use-loader';
import { useOnboardingStep } from '../../lib/use-onboarding-step';
import { useSession } from '../../providers/session';

/**
 * "Mis documentos" of the operator (D42–D44, plan-registro.md R3): step 4 of
 * their profile, where an invitation ends, then step 5. They send their own
 * INE, license and selfie (front camera) and see the state of each; RLS and
 * submit_document let them touch only their own operator row's documents.
 */
export default function OperatorDocuments() {
  const router = useRouter();
  const { session, profile } = useSession();
  const userId = session?.user.id ?? null;
  const companyId = profile?.companyId ?? null;
  const load = useCallback(
    () =>
      supabase && userId && companyId
        ? loadOperatorDocuments(supabase, companyId, userId)
        : new Promise<never>(() => undefined),
    [userId, companyId],
  );
  const { state, reload } = useLoader(load);
  const [barHeight, setBarHeight] = useState(0);
  const scroll = useRef<ScrollView>(null);

  const steps =
    state.status === 'ready' && state.data.operatorId
      ? operatorOnboarding(state.data.context, state.data.operatorId)
      : null;
  // The step in course when the data loads, kept while uploads reload it.
  const [viewed, setViewed] = useOnboardingStep(
    steps ? currentOnboardingStep('operator', steps.work) : null,
    'profile',
  );
  const { previous, next } = adjacentOnboardingSteps('operator', viewed);
  function open(step: OnboardingStep) {
    setViewed(step);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <>
      <Screen title={copy.operator.open} bottom={barHeight} scrollRef={scroll}>
        <OnboardingStepsBar profile="operator" viewed={viewed} />
        {state.status === 'loading' ? (
          <Skeleton />
        ) : state.status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : !supabase || !state.data.operatorId ? (
          <Notice tone="warning">{copy.ownerOperator.noOperator}</Notice>
        ) : viewed === 'profile' ? (
          <>
            <Footnote>{`${copy.descriptions.profile.operator} ${copy.selfieNote}`}</Footnote>
            <DocumentList
              client={supabase}
              context={state.data.context}
              owner={{ type: 'operator', id: state.data.operatorId }}
              onChanged={reload}
            />
          </>
        ) : steps ? (
          <>
            <Footnote>{copy.descriptions.verification}</Footnote>
            <OnboardingStatus groups={steps.groups} onOpenStep={open} />
          </>
        ) : null}
      </Screen>
      <TabBottomBar
        action={
          next
            ? { label: copy.next, onPress: () => open(next), size: 'large' }
            : { label: copy.app.finish, onPress: () => router.replace('/trip'), size: 'large' }
        }
        secondary={previous ? { label: copy.back, onPress: () => open(previous) } : undefined}
        onHeight={setBarHeight}
      />
    </>
  );
}
