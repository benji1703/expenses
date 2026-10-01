"use client";

import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

export const AccountPasskeys = dynamic(() => import("./passkeys").then((module) => module.PasskeyManager), {
  ssr: false,
  loading: () => <section className="passkey-card" role="status"><LoaderCircle className="spin" size={18} /><p className="muted">טוען את אמצעי הכניסה…</p></section>,
});
