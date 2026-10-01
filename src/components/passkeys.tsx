"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, KeyRound, LoaderCircle, Plus, Trash2 } from "lucide-react";

type Passkey = { id: string; friendly_name: string | null; created_at: string; last_used_at?: string | null };
const passkeySupportSubscribe = () => () => {};
const passkeySupportSnapshot = () => typeof window !== "undefined" && window.isSecureContext && "PublicKeyCredential" in window;

function passkeyMessage(error: { message: string; code?: string }) {
  if (error.code === "passkey_disabled") return "כניסה באמצעות Passkey עדיין לא הופעלה בפרויקט.";
  if (error.message.toLowerCase().includes("cancel")) return "הכניסה בוטלה.";
  if (error.message.toLowerCase().includes("not support")) return "הדפדפן או המכשיר אינם תומכים ב־Passkey.";
  return "לא ניתן להשלים את פעולת ה־Passkey. נסו שוב או השתמשו בקישור האימייל.";
}

export function PasskeySignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supported = useSyncExternalStore(passkeySupportSubscribe, passkeySupportSnapshot, () => false);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const { createClient } = await import("@/lib/supabase/browser");
      const { error: authError } = await createClient().auth.signInWithPasskey();
      if (authError) {
        setError(passkeyMessage(authError));
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("הכניסה באמצעות Passkey נכשלה. נסו שוב או השתמשו בקישור האימייל.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;
  return (
    <div className="passkey-signin">
      <div className="auth-divider"><span>או</span></div>
      <button className="secondary passkey-button" type="button" onClick={signIn} disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={18} /> : <Fingerprint size={19} />}
        {busy ? "ממתינים לאימות…" : "כניסה עם Passkey"}
      </button>
      <p className="muted">Face ID, Touch ID או מפתח אבטחה</p>
      {error && <p className="message error" role="alert">{error}</p>}
    </div>
  );
}

export function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const supported = useSyncExternalStore(passkeySupportSubscribe, passkeySupportSnapshot, () => false);

  const refresh = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/browser");
    const { data, error: listError } = await createClient().auth.passkey.list();
    if (listError) {
      setError(passkeyMessage(listError));
      return;
    }
    setPasskeys((data ?? []) as Passkey[]);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function addPasskey() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { createClient } = await import("@/lib/supabase/browser");
      const { error: registerError } = await createClient().auth.registerPasskey();
      if (registerError) {
        setError(passkeyMessage(registerError));
        return;
      }
      setMessage("ה־Passkey נוסף לחשבון. אפשר להשתמש בו לכניסה מהמכשיר הזה וממכשירים מסונכרנים.");
      await refresh();
    } catch {
      setError("לא ניתן להוסיף Passkey כרגע. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(passkey: Passkey) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { createClient } = await import("@/lib/supabase/browser");
      const { error: deleteError } = await createClient().auth.passkey.delete({ passkeyId: passkey.id });
      if (deleteError) {
        setError(passkeyMessage(deleteError));
        return;
      }
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
      setMessage("ה־Passkey הוסר מהחשבון.");
    } catch {
      setError("לא ניתן להסיר את ה־Passkey כרגע. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="passkey-card">
      <span className="section-icon"><KeyRound size={19} /></span>
      <div className="passkey-card-copy">
        <h2>כניסה עם Passkey</h2>
        <p className="muted">השתמשו ב־Face ID, Touch ID או במפתח אבטחה. במכשירי Apple, Passkey יכול להסתנכרן דרך iCloud Keychain.</p>
      </div>
      {!supported ? (
        <p className="muted">כדי להוסיף Passkey, פתחו את החשבון ב־Safari או בדפדפן תומך דרך חיבור מאובטח.</p>
      ) : (
        <>
          {passkeys.length > 0 && <ul className="passkey-list">
            {passkeys.map((passkey) => (
              <li key={passkey.id}>
                <span><Fingerprint size={17} /><strong>{passkey.friendly_name || "Passkey"}</strong><small>נוסף ב־{new Date(passkey.created_at).toLocaleDateString("he-IL")}</small></span>
                <button className="icon-button" type="button" onClick={() => void removePasskey(passkey)} disabled={busy} aria-label={`הסרת ${passkey.friendly_name || "Passkey"}`}><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>}
          <button className="primary" type="button" onClick={() => void addPasskey()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
            {busy ? "ממתינים לאימות…" : "הוספת Passkey למכשיר הזה"}
          </button>
        </>
      )}
      {message && <p className="message success" role="status">{message}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
    </section>
  );
}
