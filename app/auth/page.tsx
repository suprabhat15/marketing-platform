"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth-client';

export default function AuthPage() {
  const [tab, setTab] = useState<'signup' | 'login'>('signup');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.email({
        email: loginEmail,
        password: loginPassword,
      });

      if (result.error) {
        if (result.error.status === 403) {
          setError('Please verify your email address before signing in.');
        } else {
          setError(result.error.message || 'Login failed');
        }
      } else {
        router.push('/campaigns');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword || !signupName) {
      setError('Please fill in all fields');
      return;
    }

    if (signupPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await signUp.email({
        email: signupEmail,
        password: signupPassword,
        name: signupName,
      });

      if (result.error) {
        setError(result.error.message || 'Signup failed');
      } else {
        router.push('/campaigns');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setError('');

    try {
      await signIn.social({
        provider: 'google',
        callbackURL: '/campaigns',
      });
    } catch {
      setError('Google authentication failed');
      setIsLoading(false);
    }
  };

  const testimonials = [
    {
      quote:
        'Switched from Mailchimp. Set up took 10 minutes and deliverability is noticeably better.',
      author: 'Sarah K.',
      role: 'Indie maker',
    },
    {
      quote:
        'The pay-as-you-go model is a game changer for our seasonal campaigns.',
      author: 'Marcos R.',
      role: 'E-commerce founder',
    },
  ];

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-[oklch(0.12_0.065_265)] p-12 lg:flex lg:flex-col">
        {/* Gradient blobs */}
        <div className="absolute -bottom-30 -left-20 h-[500px] w-[500px] rounded-full bg-[oklch(0.65_0.19_38)] opacity-[0.09] blur-[80px]" />
        <div className="absolute -top-15 -right-15 h-[300px] w-[300px] rounded-full bg-[oklch(0.82_0.17_78)] opacity-[0.07] blur-[60px]" />

        <div className="relative z-10 flex flex-1 flex-col">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[oklch(0.65_0.19_38)] to-[oklch(0.82_0.17_78)] shadow-[0_2px_8px_rgba(230,113,65,0.35)]">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-white">
              MailPackr
            </span>
          </div>

          {/* Headline + testimonials */}
          <div className="flex flex-1 flex-col justify-center pt-10">
            <h2 className="mb-4 text-[clamp(28px,3vw,38px)] leading-tight font-extrabold tracking-tight text-balance text-white">
              Your audience is waiting
              <br />
              <span className="text-[oklch(0.82_0.17_78)]">
                to hear from you.
              </span>
            </h2>
            <p className="mb-13 max-w-[380px] text-[15px] leading-[1.72] text-white/[0.58]">
              Join lots of creators, marketers, and founders who use MailPackr
              to grow their audience and revenue.
            </p>

            <div className="flex flex-col gap-4">
              {testimonials.map((t) => (
                <div
                  key={t.author}
                  className="rounded-[13px] border border-white/[0.09] bg-white/[0.06] px-5 py-[18px]"
                >
                  <p className="mb-3 text-sm leading-[1.65] text-white/[0.72]">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[oklch(0.65_0.19_38)] text-[13px] font-bold text-white">
                      {t.author[0]}
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white/[0.88]">
                        {t.author}
                      </div>
                      <div className="text-xs text-white/[0.38]">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/25">
            &copy; 2026 MailPackr, Inc.
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center overflow-y-auto bg-[oklch(0.99_0.003_80)] p-6 sm:p-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[oklch(0.65_0.19_38)] to-[oklch(0.82_0.17_78)] shadow-[0_2px_8px_rgba(230,113,65,0.35)]">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight text-[oklch(0.12_0.065_265)]">
              MailPackr
            </span>
          </div>

          {/* Tab switcher */}
          <div className="mb-9 flex rounded-[10px] border border-[oklch(0.91_0.005_265)] bg-[oklch(0.965_0.006_80)] p-1">
            {(
              [
                ['signup', 'Create account'],
                ['login', 'Sign in'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setError('');
                }}
                className={`flex h-9 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-[color,background-color,box-shadow] duration-150 ${
                  tab === key
                    ? 'bg-white text-[oklch(0.14_0.03_265)] shadow-[0_1px_3px_rgba(5,10,48,0.07),0_1px_2px_rgba(5,10,48,0.04)]'
                    : 'bg-transparent text-[oklch(0.48_0.02_265)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {tab === 'signup' ? (
            <div key="signup">
              <h1 className="mb-1.5 text-[32px] font-extrabold tracking-tight text-[oklch(0.14_0.03_265)]">
                Create your account
              </h1>
              <GoogleButton onClick={handleGoogleAuth} disabled={isLoading} />
              <Divider />

              <form
                onSubmit={handleSignup}
                className="flex flex-col gap-[18px]"
              >
                <AuthInput
                  label="Full name"
                  placeholder="Jane Smith"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                />
                <AuthInput
                  label="Work email"
                  type="email"
                  placeholder="jane@company.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
                <AuthInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  hint="Use a mix of letters, numbers, and symbols"
                  action={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-2.5 flex -translate-y-1/2 cursor-pointer border-none bg-none p-0.5 text-[oklch(0.48_0.02_265)]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[9px] border-none bg-[oklch(0.65_0.19_38)] px-7 py-3.5 text-base font-semibold text-white transition-all hover:brightness-[0.91] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isLoading ? 'Creating account...' : 'Create account'}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <p className="mt-6 text-center text-[13px] leading-[1.7] text-[oklch(0.48_0.02_265)]">
                By signing up you agree to our{' '}
                <a
                  href="https://mailpackr.com/terms/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[oklch(0.65_0.19_38)] no-underline"
                >
                  Terms
                </a>{' '}
                and{' '}
                <a
                  href="https://mailpackr.com/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[oklch(0.65_0.19_38)] no-underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          ) : (
            <div key="login">
              <h1 className="mb-1.5 text-[32px] font-extrabold tracking-tight text-[oklch(0.14_0.03_265)]">
                Welcome back
              </h1>
              <p className="mb-8 text-[15px] text-[oklch(0.48_0.02_265)]">
                Sign in to your MailPackr account
              </p>

              <GoogleButton onClick={handleGoogleAuth} disabled={isLoading} />
              <Divider />

              <form onSubmit={handleLogin} className="flex flex-col gap-[18px]">
                <AuthInput
                  label="Email"
                  type="email"
                  placeholder="jane@company.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />

                <div className="flex flex-col gap-[5px]">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[oklch(0.14_0.03_265)]">
                      Password
                    </label>
                    <a
                      href="#"
                      className="text-sm font-medium text-[oklch(0.65_0.19_38)] no-underline"
                    >
                      Forgot?
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full rounded-[9px] border-[1.5px] border-[oklch(0.91_0.005_265)] bg-white px-3.5 py-2.5 text-[15px] text-[oklch(0.14_0.03_265)] transition-colors outline-none focus:border-[oklch(0.65_0.19_38)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-2.5 flex -translate-y-1/2 cursor-pointer border-none bg-none p-0.5 text-[oklch(0.48_0.02_265)]"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[9px] border-none bg-[oklch(0.65_0.19_38)] px-7 py-3.5 text-base font-semibold text-white transition-all hover:brightness-[0.91] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  hint,
  action,
}: {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label className="text-sm font-semibold text-[oklch(0.14_0.03_265)]">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`w-full rounded-[9px] border-[1.5px] border-[oklch(0.91_0.005_265)] bg-white py-2.5 text-[15px] text-[oklch(0.14_0.03_265)] transition-colors outline-none focus:border-[oklch(0.65_0.19_38)] ${action ? 'pr-11 pl-3.5' : 'px-3.5'}`}
        />
        {action}
      </div>
      {hint && (
        <span className="text-xs text-[oklch(0.48_0.02_265)]">{hint}</span>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-[oklch(0.91_0.005_265)]" />
      <span className="text-xs font-medium text-[oklch(0.48_0.02_265)]">
        or
      </span>
      <div className="h-px flex-1 bg-[oklch(0.91_0.005_265)]" />
    </div>
  );
}

function GoogleButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[9px] border-[1.5px] border-[oklch(0.91_0.005_265)] bg-white px-4 py-3 text-[15px] font-semibold text-[oklch(0.14_0.03_265)] transition-colors hover:border-[oklch(0.48_0.02_265)] disabled:cursor-not-allowed disabled:opacity-55"
    >
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      Continue with Google
    </button>
  );
}
