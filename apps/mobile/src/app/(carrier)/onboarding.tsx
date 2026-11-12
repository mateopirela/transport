import {
  adjacentOnboardingSteps,
  COMMON_COMPANY_DOCUMENTS,
  currentOnboardingStep,
  onboardingProfileOf,
  onboardingStepsCopy as copy,
  unitLabel,
  type OnboardingStep,
} from '@transport/shared';
import { Stack, useRouter } from 'expo-router';
import { Fragment, useCallback, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

import { DocumentList } from '../../components/document-list';
import { OnboardingStatus, OnboardingStepsBar } from '../../components/onboarding-steps';
import {
  BottomBar,
  Cell,
  Footnote,
  Group,
  groupInset,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
} from '../../components/ui';
import { carrierOnboarding } from '../../lib/onboarding';
import { useOnboardingStep } from '../../lib/use-onboarding-step';
import { loadOwnerDocuments } from '../../lib/owner-documents-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';
import { useSession } from '../../providers/session';

const isCommon = (code: string) => COMMON_COMPANY_DOCUMENTS.includes(code);
const isOwn = (code: string) => !COMMON_COMPANY_DOCUMENTS.includes(code);

/**
 * Steps 3, 4 and 5 of the sign-up (D42, plan-registro.md R3) for the Gerente
 * and the hombre-camión: (3) the common documents of the company, (4) the
 * Gerente's company (business units and coordinators, in "Mi empresa") or the
 * hombre-camión's truck and his own documents as its operator (D13), with
 * the selfie from the front camera, and (5) "En verificación". Opens on the
 * step in course; "Regresar" and "Siguiente" move between them. A
 * Coordinador only reads (the documents are the Gerente's, G1a).
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const userId = session?.user.id ?? null;
  const load = useCallback(
    ({ client, companyId }: CarrierContext) =>
      userId ? loadOwnerDocuments(client, companyId, userId) : new Promise<never>(() => undefined),
    [userId],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const [barHeight, setBarHeight] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const readOnly = !carrier?.isManager;
  const onboardingProfile =
    onboardingProfileOf('manager', profile?.isOwnerOperator ?? false) ?? 'manager';
  const ownerOperator = onboardingProfile === 'owner_operator';

  const ready = state.status === 'ready' && carrier;
  const steps = ready ? carrierOnboarding(state.data, ownerOperator) : null;
  // The step in course when the data loads, kept while uploads reload it.
  const [viewed, setViewed] = useOnboardingStep(
    steps ? currentOnboardingStep(onboardingProfile, steps.work) : null,
    'documents',
  );
  const { previous, next } = adjacentOnboardingSteps(onboardingProfile, viewed);
  function open(step: OnboardingStep) {
    setViewed(step);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <>
      <Screen belowHeader bottom={barHeight} scrollRef={scroll}>
        <Stack.Screen options={{ title: copy.app.title }} />
        <OnboardingStepsBar profile={onboardingProfile} viewed={viewed} />
        {state.status === 'loading' ? (
          <Skeleton />
        ) : state.status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : ready && steps ? (
          <>
            {viewed === 'documents' ? (
              <>
                <Footnote>{copy.descriptions.documents}</Footnote>
                <DocumentList
                  client={carrier.client}
                  context={state.data.context}
                  owner={{ type: 'company', id: carrier.companyId }}
                  onChanged={reload}
                  readOnly={readOnly}
                  codes={isCommon}
                />
              </>
            ) : viewed === 'profile' ? (
              <>
                <Footnote>{copy.descriptions.profile[onboardingProfile]}</Footnote>
                {steps.work.profile.length > 0 && !ownerOperator ? (
                  <DocumentList
                    client={carrier.client}
                    context={state.data.context}
                    owner={{ type: 'company', id: carrier.companyId }}
                    onChanged={reload}
                    readOnly={readOnly}
                    codes={isOwn}
                  />
                ) : null}
                {!ownerOperator ? (
                  <Group inset={groupInset.icon}>
                    <Cell
                      role="link"
                      icon="people"
                      title={copy.app.myCompany}
                      subtitle={copy.groups.coordinators}
                      onPress={() => router.push('/my-company')}
                    />
                  </Group>
                ) : (
                  <>
                    <SectionHeader title={copy.groups.units} />
                    {state.data.vehicles.length === 0 ? (
                      <>
                        <Footnote>{copy.ownerOperator.noUnits}</Footnote>
                        {!readOnly ? (
                          <Group inset={groupInset.icon}>
                            <Cell
                              role="link"
                              icon="units"
                              title={copy.app.addUnit}
                              onPress={() => router.push('/vehicle/new')}
                            />
                          </Group>
                        ) : null}
                      </>
                    ) : (
                      state.data.vehicles.map((vehicle) => (
                        <Fragment key={vehicle.id}>
                          <Footnote>{unitLabel(vehicle)}</Footnote>
                          <DocumentList
                            client={carrier.client}
                            context={state.data.context}
                            owner={{ type: 'vehicle', id: vehicle.id }}
                            onChanged={reload}
                            readOnly={readOnly}
                          />
                        </Fragment>
                      ))
                    )}
                    <SectionHeader title={copy.groups.personal} />
                    {state.data.operatorId ? (
                      <>
                        <Footnote>{`${copy.sameIdNote} ${copy.selfieNote}`}</Footnote>
                        <DocumentList
                          client={carrier.client}
                          context={state.data.context}
                          owner={{ type: 'operator', id: state.data.operatorId }}
                          onChanged={reload}
                          readOnly={readOnly}
                        />
                      </>
                    ) : (
                      <Notice tone="warning">{copy.ownerOperator.noOperator}</Notice>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <Footnote>{copy.descriptions.verification}</Footnote>
                {ownerOperator && state.data.vehicles.length === 0 ? (
                  <Notice tone="warning">{copy.ownerOperator.noUnits}</Notice>
                ) : null}
                <OnboardingStatus groups={steps.groups} onOpenStep={open} />
              </>
            )}
          </>
        ) : null}
      </Screen>
      <BottomBar
        action={
          next
            ? { label: copy.next, onPress: () => open(next), size: 'large' }
            : { label: copy.app.finish, onPress: () => router.replace('/home'), size: 'large' }
        }
        secondary={previous ? { label: copy.back, onPress: () => open(previous) } : undefined}
        onHeight={setBarHeight}
      />
    </>
  );
}
