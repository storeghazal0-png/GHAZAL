import { redirect } from 'next/navigation';

export default function AdminSystemHealthRedirect() {
  redirect('/admin/system?tab=health');
}
