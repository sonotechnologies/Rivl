// Strips personal data from task text before it goes to a model.

const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]"],
  // Phone numbers: 7+ digits with optional separators and country code.
  [/(?:\+?\d[\s().-]?){7,}\d/g, "[phone]"],
  // Card-like or account-like digit runs.
  [/\b\d{8,}\b/g, "[number]"],
  [/(^|\s)@\w{2,}/g, "$1[handle]"],
];

export function redact(text: string | null | undefined, maxLength = 500) {
  if (!text) return "";
  let out = text.slice(0, maxLength * 2);
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out.slice(0, maxLength).trim();
}
