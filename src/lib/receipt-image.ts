import { receiptImageSize } from "./receipt-ocr.ts";

/** Flatten transparent screenshots onto paper and bound OCR memory on iPhones. */
export async function prepareReceiptImage(file: Blob) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await image.decode();
    const size = receiptImageSize(image.naturalWidth, image.naturalHeight);
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("לא ניתן לעבד את התמונה.");
    context.fillStyle = "white";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("לא ניתן לקרוא את התמונה.")), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0; canvas.height = 0;
  }
}
