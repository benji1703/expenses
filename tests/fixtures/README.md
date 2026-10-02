The Hebrew receipt image is a synthetic test fixture, not a real transaction.

Expected fields:
- Supplier: אור חשמל בע״מ
- Document: חשבונית מס / קבלה
- Reference: 004821
- Issue date: 02/10/2026
- Subtotal: ₪1,000.00
- VAT: 18%, ₪180.00
- Final total: ₪1,180.00

`npm test` runs the image through the bundled Hebrew and English Tesseract
languages locally, then checks the extracted fields. No external OCR service or
language download is required. Text-based examples cover payment requests,
quotes, ambiguous totals, customer names, category matching and RTL PDF text.
