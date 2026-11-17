import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, email, token } = body;

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. If email and token/OTP are provided, verify them first
    if (email && token) {
      let cleanToken = String(token).trim();
      if (cleanToken.includes("token=")) {
        const match = cleanToken.match(/token=([a-zA-Z0-9_-]+)/);
        if (match) cleanToken = match[1];
      }

      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email: String(email).trim(),
          token: cleanToken,
          type: "recovery",
        });

      if (verifyError || !verifyData.session) {
        return NextResponse.json(
          {
            error:
              verifyError?.message ||
              "Баталгаажуулах код буруу эсвэл хугацаа нь дууссан байна. Шинээр хүсэлт илгээнэ үү.",
          },
          { status: 400 }
        );
      }
    }

    // 2. Update user's password
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Нууц үг амжилттай шинэчлэгдлээ",
    });
  } catch (err: unknown) {
    console.error("Reset password API error:", err);
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
