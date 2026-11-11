import { brokeredCopy, type BrokeredAdminStage } from '@transport/shared';

import { Pill, type PillTone } from '@/components/ui/pill';

const TONES: Record<BrokeredAdminStage, PillTone> = {
  toQuote: 'attention',
  waitingClient: 'pending',
  published: 'progress',
  contracted: 'done',
  closed: 'inactive',
};

/** Where a brokered load is in the admin's inbox (I6). */
export function BrokeredStagePill({ stage }: { stage: BrokeredAdminStage }) {
  return <Pill tone={TONES[stage]}>{brokeredCopy.admin.stage[stage]}</Pill>;
}
