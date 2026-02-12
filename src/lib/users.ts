export function createUserId(name: string, existingIds: Set<string>): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const fallbackBase = base || 'user';
  let candidate = fallbackBase;
  let counter = 1;
  while (existingIds.has(candidate)) {
    candidate = `${fallbackBase}-${counter++}`;
  }
  return candidate;
}
