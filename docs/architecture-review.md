# Architecture and iOS review — 2026-10-03

## Structure

Route files in `src/app` are adapters for Next.js routing and server boundaries. The shared server workspace lives in `src/components/workspace-page.tsx`; pages no longer import another route's page component. Client components own rendering, dialogs and user interactions.

Keep data transformations and validation as pure functions: expense schemas, ledger filters, receipt extraction, exports and navigation rules. Use classes where there is a resource lifecycle: `OfflineDatabase` owns IndexedDB connections and transactions; `MobileViewportController` owns viewport listeners, animation frames and keyboard geometry. React starts and disposes controllers. No inheritance hierarchy or ORM is needed for the current application.

Expense creation and editing use one pipeline: local validation → durable draft and attachments → authenticated upload → `/api/offline/expenses` replay → server validation and current membership/RLS → acknowledgment → remove draft. The obsolete `saveExpense` server action has been removed. `expenseReplaySchema` defines the wire contract; `expenseSchema` validates business fields locally and on the server.

## Findings addressed

| Finding | Change | Regression coverage |
| --- | --- | --- |
| Separate cache reads and writes could lose concurrent category/expense updates | Read, merge and write in one IndexedDB transaction | Concurrent writes, transaction rollback, failed-open retry |
| Small filter fonts overrode mobile control sizing | Coarse-pointer inputs use 16px text; date and month controls share sizing | CSS review; live Safari check pending |
| The onscreen keyboard could cover dialog fields/actions | Dialog uses visual viewport geometry; navigation hides while the keyboard is open | Keyboard open/close, pinch zoom, desktop, browser bars, listener cleanup |
| Native request timeout support excluded older browsers | Shared AbortController timeout includes response-body reading and clears timers | Missing native API, stalled body, successful/failed request cleanup |
| A timed-out access response could be classified as permission denial | Abort failures retain a retryable draft | Stalled access body keeps receipts and permits retry |
| Online/offline filters accepted different malformed values | Shared parsing for month, UUID, search and pagination; repeated values ignored | Online record and browser URL parameter cases |
| Membership service failures redirected approved users to access denial | Service failures reach a retry error boundary; missing membership still denies access | Missing claims, revoked membership, service errors |

The [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) exposes the space available above the onscreen keyboard. The controller ignores pinch zoom rather than treating it as a keyboard. The AbortController helper avoids relying on the newer [AbortSignal.timeout API](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static). Touch icon and text actions have at least a 44px target, consistent with [W3C target-size guidance](https://www.w3.org/WAI/WCAG21/Understanding/target-size).

## Validation

116 automated tests pass, along with ESLint and the webpack production build (including TypeScript checks). Tests cover Hebrew receipt/PDF extraction, editable OCR suggestions, file-picker cancellation, export failures, offline drafts and account isolation, lost acknowledgments, receipt retries, optimistic-edit conflicts, read-only denial, admin access management, route selection and reconnection.

Database review checked migrations, RLS, receipt indexes and the last-admin guard. No database migration is required for these changes. The SQL security fixtures were reviewed but were not executed against the live project during this audit. Use a disposable database for `tests/admin-guard.sql` and its concurrency checks.

Local browser validation remains outstanding: this environment rejected listening on a local server and the cached WebKit process failed to launch. Automated controller tests do not establish physical iPhone rendering correctness or Safari storage persistence under eviction.

## Remaining device checks

Use iPhone Safari and an installed home-screen app at 320–430px portrait widths, landscape, and an iPad; compare desktop Safari and Chrome.

1. Open creation/edit dialogs, focus every field, open date/month pickers, scroll to Save, close the keyboard and verify navigation returns. Cancel the camera/file chooser without closing or blocking the editor.
2. Navigate every route: selection changes immediately while the skeleton loads. Verify the page stays within the viewport and only the expense table scrolls horizontally.
3. Disconnect after an authenticated visit. Create an expense with multiple attachments, navigate cached pages, reconnect and verify one expense is saved with every attachment. Suspend and reopen the app to resume pending sync.
4. Confirm read-only accounts have no write controls. Revoke access or change an expense on another device while a draft waits; synchronization must preserve the draft and explain the conflict.
5. Register and use a Passkey on iPhone/Mac, then verify the email-link fallback. Exercise Hebrew digital/scanned PDFs and alternative OCR amount/supplier choices on-device.

No background-upload guarantee is made: pending work resumes when the application is open. Cached ledger data remains a labeled subset. Existing lazy OCR loading, embedded PDF text extraction, bounded rasterization, server pagination, selective queries and visited-page caching remain in place; this audit does not claim a measured performance improvement on physical devices.
