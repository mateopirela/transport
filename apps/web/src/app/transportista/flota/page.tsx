import { redirect } from 'next/navigation';

import { paths } from '@/lib/routing';

/** The fleet opens on its units (G10b). */
export default function CarrierFleetPage() {
  redirect(paths.carrierUnits);
}
