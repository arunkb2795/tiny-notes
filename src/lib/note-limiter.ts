export function createNoteLimiter(now = Date.now) {
  const entries = new Map<string, { count: number; expires: number }>();
  return function allow(userId: string): boolean {
    const time = now();
    for (const [key, entry] of entries) if (entry.expires <= time) entries.delete(key);
    const entry = entries.get(userId);
    if (entry) {
      if (entry.count >= 120) return false;
      entry.count++;
    } else {
      if (entries.size >= 10_000) return false;
      entries.set(userId, { count: 1, expires: time + 60_000 });
    }
    return true;
  };
}
