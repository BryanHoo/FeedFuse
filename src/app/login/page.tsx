import { redirect } from 'next/navigation';
import LoginPage from '@/features/auth/LoginPage';
import { isAuthenticated } from '@/server/auth/session';

export default async function LoginRoutePage() {
  if (await isAuthenticated()) {
    redirect('/');
  }

  return <LoginPage />;
}
