"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDisposableEmail } from "@/lib/disposableEmailDomains";

export interface AuthActionResult {
  error: string | null;
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (isDisposableEmail(email)) {
    return { error: "Please use a permanent email address to sign up." };
  } if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Depending on your Supabase project's auth settings, this either logs
  // the user in immediately or requires email confirmation first. Either
  // way, sending them to the dashboard is fine — middleware.ts will bounce
  // them back to /login if they're not actually authenticated yet.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately generic message — don't reveal whether the email exists
    // in the system, standard practice to avoid account enumeration.
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
