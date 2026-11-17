"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Lock,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Sparkles,
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

  // Fallback OTP / Token inputs if redirect failed
  const [manualEmail, setManualEmail] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuthSources() {
      // 1. Check if error was passed in URL query
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const urlError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (urlError) {
          setError(decodeURIComponent(urlError));
          setShowManualForm(true);
          setCheckingSession(false);
          return;
        }

        // 2. Check if a code is in query params (?code=...)
        const code = url.searchParams.get("code");
        if (code) {
          try {
            const { data, error: codeErr } =
              await supabase.auth.exchangeCodeForSession(code);
            if (!codeErr && data.session) {
              setHasValidSession(true);
              setCheckingSession(false);
              return;
            }
          } catch (e) {
            console.warn("Error exchanging code for session:", e);
          }
        }

        // 3. Check if tokens are in URL hash (#access_token=...&refresh_token=...)
        const hash = window.location.hash;
        if (hash && hash.includes("access_token=")) {
          try {
            const cleanHash = hash.replace(/^#/, "");
            const params = new URLSearchParams(cleanHash);
            const accessToken = params.get("access_token");
            const refreshToken = params.get("refresh_token");

            if (accessToken && refreshToken) {
              const { data, error: setSessionErr } =
                await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });

              if (!setSessionErr && data.session) {
                setHasValidSession(true);
                setCheckingSession(false);
                return;
              }
            }
          } catch (e) {
            console.warn("Error setting session from URL hash:", e);
          }
        }
      }

      // 4. Check existing session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setHasValidSession(true);
        setCheckingSession(false);
        return;
      }

      // 5. Listen for auth state change
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
          setHasValidSession(true);
          setCheckingSession(false);
        }
      });

      // Timeout fallback
      const timer = setTimeout(async () => {
        const {
          data: { session: delayedSession },
        } = await supabase.auth.getSession();

        if (delayedSession) {
          setHasValidSession(true);
        } else {
          setShowManualForm(true);
        }
        setCheckingSession(false);
      }, 1000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    checkAuthSources();
  }, [supabase]);

  async function handleSessionSubmit(e: React.FormEvent) {
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

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!manualEmail.trim()) {
      setError("И-мэйл хаягаа оруулна уу.");
      return;
    }

    if (!manualToken.trim()) {
      setError("И-мэйлээр ирсэн код эсвэл token-оо оруулна уу.");
      return;
    }

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
      // 1. Verify OTP token for recovery
      let cleanToken = manualToken.trim();
      // If user pasted a full URL or token= parameter, extract the token
      if (cleanToken.includes("token=")) {
        const match = cleanToken.match(/token=([a-zA-Z0-9_-]+)/);
        if (match) cleanToken = match[1];
      }

      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email: manualEmail.trim(),
          token: cleanToken,
          type: "recovery",
        });

      if (verifyError || !verifyData.session) {
        throw new Error(
          verifyError?.message ||
            "Код буруу эсвэл хугацаа нь дууссан байна. Шинээр хүсэлт илгээнэ үү."
        );
      }

      // 2. Update user's password using established session
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
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
        ) : hasValidSession ? (
          /* Active session flow: user just enters new password */
          <form onSubmit={handleSessionSubmit} className="space-y-4">
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
        ) : (
          /* Manual token / OTP flow when redirect link pointed to localhost */
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Кодоор шууд шинэчлэх
              </div>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
                Хэрэв и-мэйлээр ирсэн линк localhost руу зааж байгаа бол доорх
                талбарт бүртгэлтэй <strong>И-мэйл</strong> болон и-мэйлээр ирсэн{" "}
                <strong>6-8 оронтой код</strong> (эсвэл линкэн дээрх token-оо) оруулаад шинэ нууц үгээ шууд хадгалж болно.
              </p>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="manualEmail"
                  className="block text-xs font-medium mb-1"
                >
                  Бүртгэлтэй и-мэйл хаяг
                </label>
                <div className="relative">
                  <input
                    id="manualEmail"
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    required
                    placeholder="Жишээ: beautytechllc24@gmail.com"
                    className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="manualToken"
                  className="block text-xs font-medium mb-1"
                >
                  Баталгаажуулах код (OTP эсвэл Token)
                </label>
                <div className="relative">
                  <input
                    id="manualToken"
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    required
                    placeholder="Жишээ: 58705843 эсвэл линкийн token"
                    className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="manualPassword"
                  className="block text-xs font-medium mb-1"
                >
                  Шинэ нууц үг
                </label>
                <div className="relative">
                  <input
                    id="manualPassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
                  htmlFor="manualConfirmPassword"
                  className="block text-xs font-medium mb-1"
                >
                  Шинэ нууц үгээ дахин оруулах
                </label>
                <div className="relative">
                  <input
                    id="manualConfirmPassword"
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
                disabled={
                  loading ||
                  !manualEmail ||
                  !manualToken ||
                  !password ||
                  !confirmPassword
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Шалгаж байна..." : "Шинэ нууц үг хадгалах"}
              </button>
            </form>

            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <Link
                href="/forgot-password"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Дахин холбоос авах
              </Link>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground"
              >
                Нэвтрэх рүү буцах
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
