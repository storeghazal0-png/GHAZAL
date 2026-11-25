import { redirect } from 'next/navigation';

export default function AdminBackupsRedirect() {
  redirect('/admin/system?tab=backups');
}
