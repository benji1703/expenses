"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { login, type ActionState } from "@/app/actions";
import { PasskeySignIn } from "@/components/passkeys";
import { FormStatus } from "@/components/form-status";

const initial: ActionState = {};
export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token"),
      refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    // Supabase's default invitation emails use an implicit callback. Consume it and
    // immediately erase the URL fragment; custom token-hash emails use the server route.
    window.history.replaceState(null, "", "/login");
    void import("@/lib/supabase/browser")
      .then(({ createClient }) => createClient().auth.setSession({ access_token, refresh_token }))
      .then(({ error }) => {
        if (!error) {
          router.replace("/");
          router.refresh();
        }
      });
  }, [router]);
  return (
    <form action={action} className="stack">
      <label>
        כתובת אימייל
        <input
          name="email"
          type="email"
          placeholder="you@gmail.com"
          required
          autoComplete="email"
          maxLength={254}
        />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : null}
        {pending ? "שולחים קישור…" : "שלחו לי קישור כניסה"}
      </button>
      <FormStatus state={state} />
      <PasskeySignIn />
    </form>
  );
}
