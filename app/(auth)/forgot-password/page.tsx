"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, CheckCircle2, Mail, Loader2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "И-мэйл илгээхэд алдаа гарлаа");
      }

      setIsSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "И-мэйл илгээхэд алдаа гарлаа";
      if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit")) {
        setError("Хэт олон удаа хүсэлт илгээсэн байна. 1-2 минут хүлээгээд дахин оролдоно уу.");
      } else {
        setError(msg);
      }
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
          <h1 className="text-2xl font-bold">Нууц үг сэргээх</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Бүртгэлтэй и-мэйл хаягаа оруулж нууц үгээ шинэчилнэ үү
          </p>
        </div>

        {isSubmitted ? (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">И-мэйл илгээгдлээ!</h3>
              <p className="text-xs text-muted-foreground">
                Бид <strong className="text-foreground">{email}</strong> хаяг руу нууц үг шинэчлэх холбоос илгээлээ.
              </p>
            </div>

            <div className="rounded-lg bg-muted/60 p-3 text-left text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Санамж:</p>
              <p>• И-мэйлийн Inbox болон Spam (Спам) хавтсаа шалгана уу.</p>
              <p>• Ирсэн линк дээр дарж шинэ нууц үгээ тохируулна.</p>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                Өөр и-мэйлээр дахин илгээх
              </button>

              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Нэвтрэх хуудас руу буцах
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
              >
                И-мэйл хаяг
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="you@example.com"
                />
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
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
              disabled={loading || !email.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Илгээж байна..." : "Сэргээх холбоос илгээх"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Нэвтрэх хуудас руу буцах
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
