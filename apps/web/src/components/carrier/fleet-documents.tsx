import { carrierWebCopy } from '@transport/shared';

import { DocumentUpload } from '@/components/document-upload';
import { RequirementList } from '@/components/verification';
import type { FleetProgress } from '@/lib/carrier/fleet';
import { registerFleetDocument } from '@/lib/carrier/fleet-actions';
import { carrierDocumentFilePath } from '@/lib/routing';

const c = carrierWebCopy.fleet.documents;

/**
 * Documents of a unit or an operator (G10b; B18 on the app): every
 * requirement of the D16 catalog with its state, the latest file and the B12
 * upload form for the ones missing, rejected or expired. A pending one waits
 * for the admin.
 */
export function FleetDocuments({
  companyId,
  owner,
  progress,
}: {
  companyId: string;
  owner: { type: 'vehicle' | 'operator'; id: string };
  progress: FleetProgress;
}) {
  return (
    <RequirementList
      progress={progress}
      action={({ requirement, document, state }) => (
        <div className="space-y-3">
          {document && (
            <a
              href={carrierDocumentFilePath(document.id)}
              target="_blank"
              rel="noreferrer"
              className="text-subhead text-accent-text underline-offset-4 hover:underline"
            >
              {c.file}
            </a>
          )}
          {(state === 'missing' || state === 'rejected' || state === 'expired') && (
            <DocumentUpload
              companyId={companyId}
              ownerType={owner.type}
              ownerId={owner.id}
              requirementId={requirement.id}
              requiresExpiry={requirement.requires_expiry}
              replacing={state !== 'missing'}
              registerAction={registerFleetDocument}
            />
          )}
        </div>
      )}
    />
  );
}
