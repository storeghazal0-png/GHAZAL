import { redirect } from 'next/navigation';

export default function AdminDataRetentionRedirect() {
  redirect('/admin/system?tab=retention');
}
