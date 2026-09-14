'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import useAutoDismiss from '@/lib/useAutoDismiss';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    !token ? 'Invalid or missing reset token. Please use the link from your email.' : ''
  );
  const [success, setSuccess] = useState('');

  useAutoDismiss(success, setSuccess);
  useAutoDismiss(error, setError);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;
    if (!PASSWORD_PATTERN.test(password)) {
      setError('Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, and one special character.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setTimeout(() => router.push('/login'), 2500);
      } else {
        setError(data.error || 'Failed to reset password.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden md:flex w-[38%] bg-[#1a3a5c] flex-col items-center justify-between py-16 px-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
          <div className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/20 shadow-xl">
            <Image src="/mmtvtc-logo.png" alt="MMTVTC Seal" fill sizes="(max-width: 768px) 100vw, 112px" className="object-cover" priority />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">SkillSupply</h1>
            <p className="text-[#8fb3d4] text-sm mt-2 leading-relaxed">Supply Management Information System</p>
          </div>
          <div className="w-32 h-px bg-[#2a4e7a] mt-2" />
        </div>
        <p className="text-[#6a93b8] text-xs text-center leading-relaxed">
          Mandaluyong Manpower Technical-Vocational<br />Training Center
        </p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
            <p className="text-sm text-gray-500 mt-1">Enter a new password for your account.</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {token && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setShowRequirements(true)}
                    onBlur={() => setShowRequirements(false)}
                    placeholder="Enter new password"
                    className="w-full pl-10 pr-14 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.94" />
                        <path d="M1 1l22 22" />
                        <path d="M9.9 4.24A12.52 12.52 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-4.06 5.94" />
                        <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                      </svg>
                    )}
                  </button>
                </div>
                {showRequirements && (
                  <div className="absolute z-10 left-0 right-0 mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 shadow-sm">
                    Password requirements:
                    <span className="block mt-1">• At least 8 characters</span>
                    <span className="block">• 1 uppercase letter (A-Z)</span>
                    <span className="block">• 1 lowercase letter (a-z)</span>
                    <span className="block">• 1 special character (!@#$%^&*)</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1a3a5c] text-white rounded-xl text-sm font-semibold hover:bg-[#15304f] disabled:opacity-60 transition mt-2"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-600">
            <Link href="/login" className="text-[#1a3a5c] font-semibold hover:underline">
              ← Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
