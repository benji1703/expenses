"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { login, type ActionState } from "@/app/actions";
import { PasskeySignIn } from "@/components/passkeys";
import { FormStatus } from "@/components/form-status";

const initial: ActionState = {};
export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const [callbackError, setCallbackError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verification = useRef<Promise<boolean> | null>(null);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token"),
      refresh_token = params.get("refresh_token");
    if (!verification.current && (!access_token || !refresh_token)) return;
    // Supabase's default invitation emails use an implicit callback. Consume it and
    // immediately erase the URL fragment; custom token-hash emails use the server route.
    if (!verification.current && access_token && refresh_token) {
      window.history.replaceState(null, "", "/login");
      // Reuse the request if React remounts this effect after erasing the fragment.
      verification.current = import("@/lib/supabase/browser")
        .then(({ createClient }) => createClient().auth.setSession({ access_token, refresh_token }))
        .then(({ error }) => !error);
    }
    let current = true;
    const start = window.setTimeout(() => { if (current) setVerifying(true); }, 0);
    void verification.current!
      .then((verified) => {
        if (!current) return;
        if (!verified) {
          setCallbackError("לא ניתן להשלים את הכניסה מהקישור. בקשו קישור חדש ונסו שוב.");
        } else {
          router.replace("/");
          router.refresh();
        }
      })
      .catch(() => { if (current) setCallbackError("לא ניתן להתחבר כרגע. בדקו את החיבור ובקשו קישור חדש."); })
      .finally(() => { window.clearTimeout(start); if (current) setVerifying(false); });
    return () => { current = false; window.clearTimeout(start); };
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
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
        />
      </label>
      <button className="primary" disabled={pending || verifying}>
        {pending || verifying ? <LoaderCircle className="spin" size={18} /> : null}
        {verifying ? "משלימים כניסה…" : pending ? "שולחים קישור…" : "שלחו לי קישור כניסה"}
      </button>
      <FormStatus state={state} />
      {callbackError && <p className="message error" role="alert">{callbackError}</p>}
      <PasskeySignIn />
    </form>
  );
}
