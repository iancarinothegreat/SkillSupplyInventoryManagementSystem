'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const ROLES = [
  { value: '1', label: 'Division Staff' },
  { value: '2', label: 'Supply Officer' },
];

const USERNAME_PATTERN = /^[a-zñ]\.[a-zñ][a-zñ]+$/;
const PASSWORD_PATTERN = /^(?=.*[^A-Za-z0-9]).{8,}$/;
const FULL_NAME_CHARACTERS_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿñÑ '.\\-]*$/;

function formatFullName(value) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      const isInitial = word.length === 2 && word.charAt(1) === '.';
      if (isInitial) return word.charAt(0).toUpperCase() + '.';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleId, setRoleId] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [divisionId, setDivisionId] = useState('');
  const [divisions, setDivisions] = useState([]);

  useEffect(() => {
    fetch('/api/public/divisions')
      .then((r) => r.json())
      .then((data) => setDivisions(Array.isArray(data) ? data : []))
      .catch(() => setDivisions([]));
  }, []);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const normalizedUsername = username.trim().toLowerCase();

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setError('Username must use the format j.kdelacruz (first initial.lastname).');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (!PASSWORD_PATTERN.test(password)) {
      setError('Password must be at least 8 characters and include at least one special character.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, username: normalizedUsername, email, contact, password, role_id: roleId, division_id: divisionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Account created successfully! Redirecting to sign in...');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(data.message || data.error || 'Failed to create account.');
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

      {/* ───── Right Panel ───── */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-md">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Create a new account</h2>
            <p className="text-sm text-gray-500 mt-1">Fill in the details to get started</p>
          </div>

          {/* Error / Success */}
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

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
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
                  value={fullName}
                  onChange={(e) => {
                    if (FULL_NAME_CHARACTERS_PATTERN.test(e.target.value)) setFullName(e.target.value);
                  }}
                  onBlur={(e) => setFullName(formatFullName(e.target.value))}
                  placeholder="Juan dela Cruz"
                  pattern="[A-Za-zÀ-ÖØ-öø-ÿñÑ '.\\-]+"
                  title="Full name may contain letters, spaces, hyphens, apostrophes, dots, and ñ (e.g., Juan P. Dela Cruz)."
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Format: First Name Middle Name Last Name (e.g., Juan Dela Cruz)</p>
            </div>

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
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="j.kdelacruz"
                  pattern="[a-zñ]\.[a-zñ][a-zñ]+"
                  title="Use lowercase first initial.lastname; ñ is allowed (example: j.kaña)."
                  autoCapitalize="none"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Format: first initial.lastname (e.g., j.kdelacruz)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com (optional)"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Number</label>
              <input
                type="tel"
                value={contact}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= 11) setContact(val);
                }}
                placeholder="0917 123 4567 (optional)"
                maxLength={11}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Division</label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">Select a division (optional)</option>
                {divisions.map((d) => (
                  <option key={d.division_id} value={d.division_id}>{d.division_name}</option>
                ))}
              </select>
            </div>

            <div className="relative">
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
                  onFocus={() => setShowPasswordRequirements(true)}
                  onBlur={() => setShowPasswordRequirements(false)}
                  placeholder="Create a password"
                  minLength={8}
                  title="Use at least 8 characters, including at least one special character."
                  className="w-full pl-10 pr-14 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.94" />
                      <path d="M1 1l22 22" />
                      <path d="M9.9 4.24A12.52 12.52 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-4.06 5.94" />
                      <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                    </svg>
                  )}
                </button>
              </div>
              {showPasswordRequirements && (
                <div role="status" className="absolute z-10 left-0 right-0 mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 shadow-sm">
                  Password requirement: at least 8 characters and at least one special character (for example, <span className="font-semibold">@</span>, <span className="font-semibold">#</span>, or <span className="font-semibold">!</span>).
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1a3a5c] text-white rounded-xl text-sm font-semibold hover:bg-[#15304f] disabled:opacity-60 transition mt-2"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          {/* Back to Sign In */}
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-[#1a3a5c] font-semibold hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
