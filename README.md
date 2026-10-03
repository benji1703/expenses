# Meshek 48 — Beit Hanania renovation ledger

A private, shared expense ledger for renovating a **נחלה בבית חנניה**, Israel. Hebrew RTL interface, ILS defaults, and an official-source guide to Israel Land Authority (רמ״י) payments and Hof HaCarmel planning services.

## Features

- Invitation-only Supabase email-link authentication; public signup disabled.
- Shared project ledger with supplier/authority, amount, currency, category, project stage, payment status, due date, reference number and notes.
- Separate **paid**, **unpaid** and **estimate** amounts. All-project overview by default, optional month/category/merchant filters and 25-row pagination. Currency amounts are never converted or added across currencies.
- Private PDF/JPG/PNG attachments, up to 10 MB; server checks file signatures. Receipt links expire after 60 seconds. Receipt OCR reads Hebrew and English on-device. Attachments appear first in the expense editor and scan automatically. The selected document fills supplier, final total, dates, reference, suggested category and payment status without overwriting manual edits. Additional attachments accumulate; totals are never added together. Notes can receive the extracted supplier header (name, address, phone and tax ID); the full OCR transcript never populates notes. Optional fields and inline admin category creation stay behind secondary disclosures. Cancelling file selection leaves the editor open. Readable digital PDFs use embedded text; scanned documents use bounded images and positioned OCR lines so labels and amounts in separate Hebrew columns stay aligned. Reading stops once the main fields are found, with at most eight pages examined. Ambiguous totals require a choice, and invoices alone never establish payment.
- Project members can view shared expenses; creators and administrators can edit or delete them. Administrators manage separate lists for admins, members, pending invitations and revoked access, edit roles/access and resend links without changing permissions. Invitations use real Supabase sign-in status; unavailable status is shown explicitly. Every member can export filtered expenses to XLSX, CSV or JSON.
- Offline expense drafts and receipt files are stored in IndexedDB, isolated by account. A visible status and draft queue show pending uploads, permission errors and conflicts. Sync retries on reconnect, foreground return and every 30 seconds while the app is visible; iOS users should keep or reopen the app for uploads. Retries use stable expense/attachment IDs and optimistic edit versions.
- An installable iOS home-screen app that keeps the normal page URLs offline, including category details and date/search filters. Cached views share the online navigation, expense table and category list. The offline shell includes expense fields before the first dialog is opened, so expenses and attachments can be saved immediately after losing connection. Only the public shell/assets are service-worker cached; authenticated HTML, RSC, auth and API responses remain network-only. The offline list is explicitly a cached subset, not the complete ledger.
- Connection status stays hidden during normal online use; it appears for lost connection, pending uploads or errors. Navigation selects the destination immediately, including while its skeleton is loading.
- Primary navigation prefetches common routes and caches visited pages for 45 seconds. Successful sync refreshes the live ledger; every write checks current membership and RLS.
- Six official-source reference cards plus Beit Hanania/Hof HaCarmel council, committee, fee table and GIS links. Informational content is separate from real expenses and never calculates legal liabilities or inserts sample charges.

## Stack and security

Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Postgres/Auth/Storage, Vercel hosting, and Cloudflare DNS. Generated Supabase database types provide typed queries; no separate ORM is required. Every product table and private receipt bucket uses row-level security. Server actions validate input and independently check authentication/approval. The server-only secret key is used for invitation management, pseudonymous sign-in rate limiting, and validating uploaded receipt bytes after checking current membership, expense ownership, size and file path. Attachments upload directly to the private Supabase bucket so Vercel request-body limits do not truncate large files.

The initial administrator is `benjiar@gmail.com`; `keshet94@gmail.com` is an approved member. Hosted Supabase Auth uses custom SMTP and English magic-link/invitation templates. SMTP credentials are stored only in Supabase and are never committed here.

## Environment variables: Vercel only

Set these in the project's **Vercel Environment Variables** settings:

| Name                                   | Purpose                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Auth/Data API key; protected by RLS                       |
| `SUPABASE_SECRET_KEY`                  | Server-only Auth admin and membership management; mark Sensitive |
| `NEXT_PUBLIC_SITE_URL`                 | `https://expenses.arbibe.dev`                                    |

Do **not** create or commit environment files. For local development, use externally injected process variables or a Vercel preview deployment. Never run `vercel env pull` if local secret files are unwanted. `.env*`, `.vercel/`, `.worktrees/`, and Supabase temporary credentials are excluded from Git.

## Database

Apply migrations in `supabase/migrations/` in order; fresh projects must apply all seven. The receipt index supports ledger/summary/export lookups. The last-admin trigger serializes admin removals and keeps at least one active admin even during concurrent edits. Both new migrations must be deployed to Supabase to enable their database behavior. `supabase/config.toml` stores non-secret auth configuration and keeps public signup disabled. Auth invitation records must also exist in Supabase Auth; adding an allowlist email alone does not create a user.

Passkey authentication is enabled for `https://expenses.arbibe.dev` with relying party ID `expenses.arbibe.dev`. After signing in with the approved email link once, users can register a Passkey from **My Account**; Apple devices can offer Face ID or Touch ID and iCloud Keychain sync. Keep the relying party ID stable because changing it invalidates registered credentials. Email links remain available as a fallback.

The hosted project was provisioned via the Management API (`supabase db query --linked --project-ref … --file …`). Migration history is registered separately so future `supabase db push` does not reapply them. Regenerate `src/lib/database.types.ts` after database changes.

## Checks

See [the architecture and iOS review](docs/architecture-review.md) for module boundaries, fixes, automated coverage and outstanding device checks.

```sh
npm ci
npm run lint
npm test
npm run build
```

For local PDF/image checks, run `node --experimental-strip-types scripts/check-receipts.mjs /path/to/receipt.pdf /path/to/photo.png`. The checker uses the same PDF reader and field extractor, reports only selected fields and never copies documents into the repository. A password-protected PDF needs an unlocked copy. Anonymous Hebrew electricity-bill image and scanned-PDF fixtures cover ₪361.95 and conditional payment wording. See `docs/receipt-recognition.md` for validation scope and OCR options.

The database security test is transactional and rolls back its fixtures:

```sh
npx supabase db query --linked --project-ref YOUR_PROJECT_REF --file tests/security.sql
```

It verifies outsider denial, receipt permissions, approved household reads, creator spoof prevention, admin edits and immediate membership revocation. A signed receipt URL already issued remains usable until its short expiry. `tests/admin-guard.sql` additionally tests final-admin revoke/demote/delete on a disposable database, with concurrency-check instructions; do not run that fixture script during live user flows.

## Domain

Vercel project: `expenses`. Cloudflare zone: `arbibe.dev`. Add a **DNS-only** CNAME record named `expenses` pointing to `a463b1d09644255f.vercel-dns-017.com`, then verify the custom domain in Vercel. An A record to `76.76.21.21` is also accepted by Vercel. Keep Cloudflare authoritative for DNS; no nameserver change is needed.

## Reference content

Official links, short Hebrew explanations, and verification date live in `src/lib/renovation-guide.ts` and `src/components/guide.tsx`. The property's actual contract, parcel, plans and payment demands determine applicable charges. Review sources when policies change.

Production smoke tests verified email-link session creation, blocked public signup, Hebrew authenticated dashboard rendering, private PDF upload/signed download, anonymous receipt denial, and live access revocation. Temporary test users, memberships, expenses and files were removed.
