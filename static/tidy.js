// Display only: a pasted link's YouTube title ("Artist - Artist - Song (Official Video) [Remastered]")
// becomes song and artist. Saved files keep the original.
export function tidy(title = "", artist = "") {
  let t = title.replace(/\s*[([](official|lyrics?|audio|video|remaster|hd|4k|mv)[^)\]]*[)\]]/gi, "").trim();
  if (!artist) {
    const parts = t.split(/\s+[-–—]\s+/);
    if (parts.length > 1) { artist = parts[0]; t = parts.slice(1).filter((p) => p !== artist).join(" - "); }
  }
  return {title: t || title, artist};
}
