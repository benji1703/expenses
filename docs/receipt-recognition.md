# Receipt entry and recognition

Attach documents → review the automatically filled expense fields → save. Manual entry works without an attachment. File-picker cancellation preserves the editor and previous files. Additional selections append files instead of replacing them; removal is explicit. One selected document supplies the expense fields, and totals from multiple documents are never summed.

Supplier, amount, currency, date, category and payment status remain editable in one form. Manual changes survive later scans. Ambiguous totals become choices, and documents that do not establish payment require selecting a status. Optional project stage, reference, due date and notes sit under “פרטים נוספים”. Admins can create and immediately select a category through a secondary disclosure without leaving the expense or opening a second modal. The created category is added to the local snapshot.

“בחירת ערך אחר מהמסמך” offers other plausible labelled totals in the same currency and supplier names found in the document or closely matched to existing suppliers. Each choice changes only its field and is protected from later automatic fills. These alternatives do not lower the confidence threshold for automatic filling; customer names, tax bases and unrelated saved suppliers are excluded.

## Recognition changes

- White image background, upscaling of small screenshots, and a six-million-pixel processing budget.
- Reconstruct OCR rows from bounding boxes before extracting fields. A total in the left column remains associated with its Hebrew label in the right column.
- Prefer payable totals; reject taxable bases, VAT, kWh consumption, fees, identifiers and subtotal labels.
- A long embedded PDF text layer without a total still triggers OCR. Preserve digital metadata when the total is found only in the rendered page. Exact totals, explicit zero totals and conflicting digital totals avoid unnecessary rendering.
- Normalize electricity-company headers and narrowly matched OCR errors supported by the utility domain or bill wording; use the recognized supplier as additional category evidence. Generic electricity bills default to a payment request, never proof of payment.
- Distinguish an electricity bill's conditional receipt wording from proof of payment.
- Extract issue dates and payment deadlines even when labels and dates occupy separate rows.
- Keep readable PDFs as text; avoid loading OCR or rendering pages unnecessarily. Stop at a complete expense or an ambiguous total; examine at most eight pages.
- Never copy full OCR output, item tables or customer addresses into notes. Scanning stays cancellable.

## Validation scope

Both supplied electricity-bill images returned **361.95**, the electricity supplier, document type, issue date and payment deadline in local checks. Added anonymized image and scanned-PDF fixtures for the same amount, plus automated checks for separated columns, taxable bases, multiple attachments, protected manual edits, file-picker cancellation and inline category authorization.

Checked ten locally available invoice/receipt-named PDFs without retaining their documents in the repository. Seven positive-value invoices returned a single total; the remaining files included a zero-value invoice, a service agreement with ambiguous prices, and a password-protected document. These remain manual-entry/unsupported cases. This is a targeted corpus check, not a guarantee for every layout or a benchmark of supplier-name accuracy across vendors.

Also checked 42 local electricity PDFs from 2015–2022: all returned a positive amount, the electricity company and the electrical category when that category was supplied. Thirty-nine used embedded text; three required image OCR. The July 2021 PDF returned the expected **361.95**. This checks extraction and supplier/category matching across those layouts; amounts in the remaining documents were not independently audited against a complete set of manual ground-truth values. Private PDFs and their customer details were not added to the repository.

`node --experimental-strip-types scripts/check-receipts.mjs PATH...` prints a compact result per file. It uses the shared production PDF-reading policy and field extraction. Native canvas substitutes for the browser canvas in this check. Run unlocked documents only; no cloud service or user data upload occurs.

A live iPhone/Safari check remains necessary. The local environment could not bind a development server for browser testing.

## OCR options

The current implementation keeps Tesseract Hebrew/English recognition on the device, preserving offline use. Positioned text and image preparation follow the engine's [quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

A candidate for a separate cloud benchmark is Azure Document Intelligence v4 `prebuilt-invoice`: Microsoft's [language table](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/prebuilt?view=doc-intel-4.0.0) explicitly lists Hebrew and ILS. That documents support, not accuracy on this corpus. No Azure service was configured or benchmarked, and no documents were uploaded. A future optional online fallback would need provider credentials and comparison against the same expected fields; local OCR should remain available offline.
