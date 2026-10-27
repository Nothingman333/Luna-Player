export function letterboxdProfile(user: string | undefined): string | null {
  return user && /^[a-z0-9_]{2,40}$/i.test(user) ? `https://letterboxd.com/${user}/` : null;
}
export function avatarUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://letterboxd.com/");
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ((url.hostname === "letterboxd.com" || url.hostname.endsWith(".ltrbxd.com")) && /\/avatar\//i.test(url.pathname) || ["secure.gravatar.com","www.gravatar.com","gravatar.com"].includes(url.hostname) && /^\/avatar\/[a-f0-9]{32,64}\/?$/i.test(url.pathname)) ? url.href : null;
  } catch { return null; }
}
/** Read only explicit avatar fields; an OpenGraph film/poster image is not a profile photo. */
export function profileAvatar(html: string): string | null {
  const doc = new DOMParser().parseFromString(html.slice(0, 4 * 1024 * 1024), "text/html");
  for (const img of doc.querySelectorAll<HTMLImageElement>(".profile-avatar img, .profile-header .avatar img, .profile-person .avatar img, img.avatar")) {
    const url = avatarUrl(img.getAttribute("data-src")) ?? avatarUrl(img.getAttribute("src")) ?? avatarUrl(img.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0] ?? null);
    if (url) return url;
  }
  return avatarUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null);
}
