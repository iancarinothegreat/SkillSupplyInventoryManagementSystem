'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const savedAttempts = parseInt(sessionStorage.getItem('login_attempts') || '0', 10);
    const savedLockoutEnd = parseInt(sessionStorage.getItem('login_lockout_end') || '0', 10);
    setAttempts(savedAttempts);
    if (savedLockoutEnd > Date.now()) {
      setLockoutEnd(savedLockoutEnd);
    } else {
      sessionStorage.removeItem('login_lockout_end');
    }
  }, []);

  useEffect(() => {
    if (lockoutEnd <= 0) {
      setRemaining(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockoutEnd - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(timerRef.current);
        setLockoutEnd(0);
        sessionStorage.removeItem('login_lockout_end');
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [lockoutEnd]);

  const isLocked = remaining > 0;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.removeItem('login_attempts');
        sessionStorage.removeItem('login_lockout_end');
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        const dest = data.user.hierarchy_level >= 2 ? '/dashboard' : '/my-requisitions';
        router.push(dest);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        sessionStorage.setItem('login_attempts', String(newAttempts));
        if (newAttempts >= MAX_ATTEMPTS) {
          const end = Date.now() + LOCKOUT_SECONDS * 1000;
          setLockoutEnd(end);
          sessionStorage.setItem('login_lockout_end', String(end));
          setAttempts(0);
          sessionStorage.setItem('login_attempts', '0');
          setError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
        } else {
          setError(data.message || `Invalid username or password. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
        }
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ───── Left Panel ───── */}
      <div className="hidden md:flex w-[38%] bg-[#1a3a5c] flex-col items-center justify-between py-16 px-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">

          {/* MMTVTC Seal Logo */}
          {/*
            SETUP: Copy your logo image into:
              skillsupply/public/mmtvtc-logo.png
            That's all — the image will appear here automatically.
          */}
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

          {/* Brand */}
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">SkillSupply</h1>
            <p className="text-[#8fb3d4] text-sm mt-2 leading-relaxed">
              Supply Management Information System
            </p>
          </div>

          {/* Divider */}
          <div className="w-32 h-px bg-[#2a4e7a] mt-2" />
        </div>

        {/* Footer */}
        <p className="text-[#6a93b8] text-xs text-center leading-relaxed">
          Mandaluyong Manpower Technical-Vocational<br />Training Center
        </p>
        <p className="text-[#6a93b8] text-xs text-center mt-2">
          For Government Use Only
        </p>
      </div>

      {/* ───── Right Panel ───── */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-md">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in to your account</h2>
            <p className="text-sm text-gray-500 mt-1">Enter your credentials to continue</p>
          </div>

          {/* Lockout Banner */}
          {isLocked && (
            <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="font-medium">Account temporarily locked</p>
                <p className="text-xs mt-0.5">Too many failed attempts. Try again in <span className="font-bold text-amber-900">{remaining}s</span></p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !isLocked && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  disabled={isLocked}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
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
                  placeholder="Enter password"
                  disabled={isLocked}
                  className="w-full pl-10 pr-14 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLocked}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.94" />
                      <path d="M1 1l22 22" />
                      <path d="M9.9 4.24A12.52 12.52 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-4.06 5.94" />
                      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full py-3 bg-[#1a3a5c] text-white rounded-xl text-sm font-semibold hover:bg-[#15304f] disabled:opacity-60 transition mt-2"
            >
              {isLocked ? `Locked — ${remaining}s` : loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="mt-3">
              <Link href="/forgot-password" className="text-sm font-medium text-[#1a3a5c] hover:underline">
                Forgot your password?
              </Link>
            </div>

          </form>

        </div>
      </div>
    </div>
  );
}
