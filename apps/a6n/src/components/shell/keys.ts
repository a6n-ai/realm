export function isTypingTarget(el: { tagName: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  return el.isContentEditable === true || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
