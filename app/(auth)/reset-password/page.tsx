"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Verification state of the recovery session
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check if error was passed in URL (e.g. from callback or hash)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const urlError =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");

      if (urlError) {
        setError(decodeURIComponent(urlError));
        setCheckingSession(false);
        return;
      }
    }

    // Check existing session or listen for PASSWORD_RECOVERY event
    async function verify() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setHasValidSession(true);
        setCheckingSession(false);
        return;
      }

      // Listen for auth state change (covers hash recovery flow)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
          setHasValidSession(true);
          setCheckingSession(false);
        }
      });

      // Small delay to allow client SDK to parse token from URL hash if present
      const timer = setTimeout(async () => {
        const {
          data: { session: delayedSession },
        } = await supabase.auth.getSession();

        if (delayedSession) {
          setHasValidSession(true);
        }
        setCheckingSession(false);
      }, 1200);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    verify();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Оруулсан хоёр нууц үг хоорондоо таарахгүй байна.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

      // Redirect to dashboard after 1.8 seconds
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1800);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Нууц үг шинэчлэхэд алдаа гарлаа";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image
            src="/logo.png"
            alt="ZernFlow"
            width={48}
            height={48}
            className="mx-auto mb-3"
          />
          <h1 className="text-2xl font-bold">Шинэ нууц үг тохируулах</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Та шинэ нууц үгээ оруулан баталгаажуулна уу
          </p>
        </div>

        {checkingSession ? (
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-3">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              Холбоосыг шалгаж байна...
            </p>
          </div>
        ) : success ? (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                Нууц үг амжилттай солигдлоо!
              </h3>
              <p className="text-xs text-muted-foreground">
                Таны шинэ нууц үг хадгалагдлаа. Систем рүү шилжиж байна...
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Систем рүү орох
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : !hasValidSession ? (
          <div className="rounded-xl border border-destructive/20 bg-card p-6 shadow-sm space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                Холбоос хүчингүй эсвэл хугацаа нь дууссан байна
              </h3>
              <p className="text-xs text-muted-foreground">
                {error ||
                  "Нууц үг сэргээх холбоосыг зөвхөн нэг удаа ашиглах боломжтой бөгөөд хугацаа нь дууссан байж болзошгүй."}
              </p>
            </div>

            <div className="pt-2 space-y-2">
              <Link
                href="/forgot-password"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Шинээр холбоос авах
              </Link>

              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Нэвтрэх хуудас руу буцах
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
              >
                Шинэ нууц үг
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  placeholder="Хамгийн багадаа 6 тэмдэгт"
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-10 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium mb-1.5"
              >
                Шинэ нууц үгээ дахин оруулна уу
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Нууц үгээ давтан бичнэ үү"
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-10 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Хадгалж байна..." : "Шинэ нууц үг хадгалах"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
