'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <p className="text-sm text-gray-500">Redirecting to sign in...</p>
    </main>
  );
}
