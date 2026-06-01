// Derive a flag IMAGE url from a country's flag emoji. The emoji already encodes
// the country: most are a regional-indicator pair (e.g. 🇲🇽 → "mx"), while
// England / Scotland / Wales use a tag sequence (🏴 + "gbeng" → "gb-eng").
// Returns a flagcdn.com PNG url, or null when there's no usable flag (e.g. TBC
// placeholder teams). Using images keeps flags consistent across platforms —
// Windows browsers render regional-indicator emoji as bare letter pairs.
export function flagImageUrl(
  emoji: string | null | undefined,
  width: 20 | 40 | 80 = 40
): string | null {
  if (!emoji) return null
  const cps = Array.from(emoji, (c) => c.codePointAt(0) ?? 0)

  // Regional-indicator pair → ISO 3166-1 alpha-2 (🇲🇽 → "mx")
  const ri = cps.filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
  if (ri.length === 2) {
    const code = ri.map((cp) => String.fromCharCode(cp - 0x1f1e6 + 97)).join('')
    return `https://flagcdn.com/w${width}/${code}.png`
  }

  // Tag sequence (🏴 + lowercase tag letters) → subdivision flag (gbeng → gb-eng)
  if (cps[0] === 0x1f3f4) {
    const letters = cps
      .slice(1)
      .filter((cp) => cp >= 0xe0061 && cp <= 0xe007a)
      .map((cp) => String.fromCharCode(cp - 0xe0000))
      .join('')
    if (letters.startsWith('gb') && letters.length > 2) {
      return `https://flagcdn.com/w${width}/gb-${letters.slice(2)}.png`
    }
    if (letters) return `https://flagcdn.com/w${width}/${letters}.png`
  }

  return null
}
