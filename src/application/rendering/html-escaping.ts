const TEXT_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
};

const ATTRIBUTE_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const TEXT_ESCAPE_PATTERN = /[&<>]/g;
const ATTRIBUTE_ESCAPE_PATTERN = /[&<>"']/g;

export function escapeText(value: string): string {
  return value.replace(TEXT_ESCAPE_PATTERN, (character) => TEXT_ESCAPE_MAP[character] ?? character);
}

export function escapeAttribute(value: string): string {
  return value.replace(ATTRIBUTE_ESCAPE_PATTERN, (character) => ATTRIBUTE_ESCAPE_MAP[character] ?? character);
}

export function escapeTitle(value: string): string {
  return escapeText(value);
}
