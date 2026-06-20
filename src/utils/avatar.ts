// Always resolve to a real, renderable avatar image.
// - Empty/missing → a deterministic dicebear "adventurer" avatar seeded by the
//   user's name (so the profile / tab never show a blank circle).
// - dicebear URLs are coerced to the PNG variant: React Native's <Image> cannot
//   render SVG, and older profiles were saved with the /svg endpoint (which comes
//   through blank).
export function avatarUri(avatarUrl?: string | null, seed?: string): string {
  const s = encodeURIComponent((seed || '').trim() || 'explorer');
  const fallback = `https://api.dicebear.com/7.x/adventurer/png?seed=${s}&backgroundColor=c0aede`;

  const url = (avatarUrl || '').trim();
  if (!url) return fallback;
  if (url.includes('api.dicebear.com')) {
    // Replace the format segment (e.g. /svg?) with /png?, keeping the query.
    return url.replace(/\/(svg|jpe?g|webp|json)(\?|$)/i, '/png$2');
  }
  return url;
}
