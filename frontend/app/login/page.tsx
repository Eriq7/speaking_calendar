"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

type View = "signin" | "signup" | "verify" | "forgot" | "reset-password";

export default function LoginPage() {
  const supabase = getBrowserClient();
  const [view, setView] = useState<View>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event triggered when the user clicks
    // the reset link in their email.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset-password");
        setError(null);
        setInfo("Enter your new password below.");
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  function reset() {
    setError(null);
    setInfo(null);
  }

  async function handleSignIn() {
    reset();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  }

  async function handleSignUp() {
    reset();
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setView("verify");
      setInfo(`A 6-digit verification code was sent to ${email}.`);
    }
    setLoading(false);
  }

  async function handleVerify() {
    reset();
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  }

  async function handleForgot() {
    reset();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      setError(error.message);
    } else {
      setInfo(`Password reset link sent to ${email}. Click the link in the email to set a new password.`);
    }
    setLoading(false);
  }

  async function handleResetPassword() {
    reset();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  }

  function onKeyDown(handler: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handler();
    };
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-border">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Talk Reminder</h1>
          <p className="mt-1 text-sm text-gray-500">Your personal reminder butler</p>
        </div>

        {/* Tabs (only shown for signin/signup) */}
        {(view === "signin" || view === "signup") && (
          <div className="mb-6 flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => { setView("signin"); reset(); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                view === "signin"
                  ? "bg-accent text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setView("signup"); reset(); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                view === "signup"
                  ? "bg-accent text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Back button for sub-views */}
        {(view === "verify" || view === "forgot" || view === "reset-password") && (
          <button
            type="button"
            onClick={() => { setView("signin"); reset(); }}
            className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Sign In
          </button>
        )}

        {/* Verify email */}
        {view === "verify" && (
          <>
            <h2 className="mb-1 text-base font-semibold text-gray-900">Check your email</h2>
            {info && <p className="mb-4 text-sm text-gray-500">{info}</p>}
            <label className="mb-1 block text-xs text-gray-500">6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={onKeyDown(handleVerify)}
              placeholder="000000"
              className="mb-2 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none tracking-widest"
            />
            <p className="mb-4 text-xs text-gray-400">Didn&apos;t get the code? Check your spam or promotions folder.</p>
          </>
        )}

        {/* Forgot password */}
        {view === "forgot" && (
          <>
            <h2 className="mb-4 text-base font-semibold text-gray-900">Reset Password</h2>
            <label className="mb-1 block text-xs text-gray-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown(handleForgot)}
              placeholder="you@example.com"
              className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
            />
          </>
        )}

        {/* Set new password (after clicking email link) */}
        {view === "reset-password" && (
          <>
            <h2 className="mb-1 text-base font-semibold text-gray-900">Set New Password</h2>
            {info && <p className="mb-4 text-sm text-gray-500">{info}</p>}
            <label className="mb-1 block text-xs text-gray-500">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={onKeyDown(handleResetPassword)}
              placeholder="At least 6 characters"
              className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
            />
          </>
        )}

        {/* Sign In / Sign Up forms */}
        {(view === "signin" || view === "signup") && (
          <>
            <label className="mb-1 block text-xs text-gray-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mb-3 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
            />
            <label className="mb-1 block text-xs text-gray-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown(view === "signin" ? handleSignIn : handleSignUp)}
              placeholder="••••••••"
              className="mb-4 w-full rounded-md border border-border px-3 py-2 text-sm text-gray-900 focus:border-accent focus:outline-none"
            />
          </>
        )}

        {/* Error / info messages */}
        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        {info && view === "forgot" && (
          <>
            <p className="mb-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>
            <p className="mb-3 text-xs text-gray-400">Didn&apos;t get the email? Check your spam or promotions folder.</p>
          </>
        )}

        {/* Action button */}
        <button
          type="button"
          disabled={loading}
          onClick={
            view === "signin"
              ? handleSignIn
              : view === "signup"
              ? handleSignUp
              : view === "verify"
              ? handleVerify
              : view === "forgot"
              ? handleForgot
              : handleResetPassword
          }
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : view === "signin"
            ? "Sign In"
            : view === "signup"
            ? "Create Account"
            : view === "verify"
            ? "Verify"
            : view === "forgot"
            ? "Send Reset Link"
            : "Set New Password"}
        </button>

        {/* Forgot password link */}
        {view === "signin" && (
          <p className="mt-4 text-center text-xs text-gray-400">
            <button
              type="button"
              onClick={() => { setView("forgot"); reset(); }}
              className="text-accent hover:underline"
            >
              Forgot password?
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
