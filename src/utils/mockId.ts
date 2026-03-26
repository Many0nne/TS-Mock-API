/** Returns the value of the first recognised ID field (id, uuid, _id) in a mock object. */
export function extractMockId(obj: Record<string, unknown>): string | undefined {
  for (const field of ['id', 'uuid', '_id']) {
    if (obj[field] !== undefined) return String(obj[field]);
  }
  return undefined;
}
