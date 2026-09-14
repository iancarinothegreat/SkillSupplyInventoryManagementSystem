'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useAutoDismiss from '@/lib/useAutoDismiss';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useAutoDismiss(success, setSuccess);
  useAutoDismiss(error, setError);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setEmail('');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
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
            <Image
              src="/mmtvtc-logo.png"
              alt="MMTVTC Seal"
              fill
              sizes="(max-width: 768px) 100vw, 112px"
              className="object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">SkillSupply</h1>
            <p className="text-[#8fb3d4] text-sm mt-2 leading-relaxed">
              Supply Management Information System
            </p>
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
            <h2 className="text-2xl font-bold text-gray-900">Forgot your password?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the email address associated with your account.               We&apos;ll send you a link to reset your password.
            </p>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-3 bg-[#1a3a5c] text-white rounded-xl text-sm font-semibold hover:bg-[#15304f] disabled:opacity-60 transition mt-2"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Remember your password?{' '}
            <Link href="/login" className="text-[#1a3a5c] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
