import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PosReportRedirect() {
  redirect('/pos/cashier');
}
