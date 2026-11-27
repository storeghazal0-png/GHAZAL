import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function POSShiftsPage() {
  redirect('/pos/cashier');
}
