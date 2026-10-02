export function outsideDialog(bounds: Pick<DOMRect, "left" | "right" | "top" | "bottom">, x: number, y: number) {
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}

export function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
