import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.trim();

    if (!email) {
      return NextResponse.json(
        { error: "И-мэйл хаягаа оруулна уу" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Determine redirect origin: prioritize incoming origin or NEXT_PUBLIC_APP_URL
    const headerOrigin = request.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const origin =
      headerOrigin && !headerOrigin.includes("localhost")
        ? headerOrigin
        : appUrl || headerOrigin || "http://localhost:3000";

    const redirectTo = `${origin}/auth/callback?next=/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      if (
        error.message.includes("rate limit") ||
        error.message.includes("over_email_send_rate_limit")
      ) {
        return NextResponse.json(
          {
            error:
              "Хэт олон удаа хүсэлт илгээсэн байна. 1-2 минут хүлээгээд дахин оролдоно уу.",
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Сэргээх холбоос илгээгдлээ",
    });
  } catch (err: unknown) {
    console.error("Forgot password API error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Хүсэлт боловсруулахад алдаа гарлаа",
      },
      { status: 500 }
    );
  }
}
