'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

function getLastRoute(): string {
  try {
    const bookId = localStorage.getItem('lexis-last-book');
    return bookId ? `/reader/${bookId}` : '/library';
  } catch {
    return '/library';
  }
}

export default function HomePage() {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(getLastRoute());
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      router.replace(getLastRoute());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithGoogle();
      router.replace(getLastRoute());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-amber-100 p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">Lexis</h1>
          <p className="mt-2 text-sm text-gray-400">Your personal e-reader</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
          />
          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors font-medium"
          >
            {submitting ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <hr className="flex-1 border-gray-100" />
          <span className="text-xs text-gray-300">or</span>
          <hr className="flex-1 border-gray-100" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-2.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-700"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="mt-6 text-center text-xs text-gray-400">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            className="text-gray-900 font-medium hover:underline"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.252 17.64 11.944 17.64 9.2z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
