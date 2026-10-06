/**
 * WCAG contrast, computed from the colours the stylesheet actually declares.
 *
 * Tailwind 4 writes its palette in `oklch()`, so a check that only read hex would have to be
 * fed a second, hand-converted copy of every colour — and that copy is what drifts.
 */

/** Gamma-encoded sRGB, each channel in 0..1. */
export type Rgb = readonly [number, number, number]

const clamp = (value: number): number => Math.min(1, Math.max(0, value))

const encode = (linear: number): number =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055

const decode = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** Björn Ottosson's OKLab → linear sRGB, then encoded and clamped to the sRGB gamut. */
const fromOklch = (lightness: number, chroma: number, hue: number): Rgb => {
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((linear) => clamp(encode(clamp(linear)))) as unknown as Rgb
}

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/
const HEX = /^#([\da-f]{6})$/i

/** `#rrggbb` or `oklch(L% C H)` — the two forms this app and Tailwind write. */
export const parseColor = (value: string): Rgb => {
  const trimmed = value.trim()
  const oklch = OKLCH.exec(trimmed)
  if (oklch !== null) {
    const [, lightness = '', percent, chroma = '', hue = ''] = oklch
    return fromOklch(Number(lightness) / (percent === '%' ? 100 : 1), Number(chroma), Number(hue))
  }
  const hex = HEX.exec(trimmed)
  if (hex !== null) {
    const digits = hex[1] ?? ''
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16) / 255) as unknown as Rgb
  }
  throw new Error(`Farbe nicht lesbar: ${value}`)
}

/** `top` at `alpha` over `bottom`, mixed the way a browser does: in encoded sRGB. */
export const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((channel, at) => alpha * channel + (1 - alpha) * (bottom[at] ?? 0)) as unknown as Rgb

const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)

/** The WCAG 2 ratio, 1..21, independent of which colour is the lighter one. */
export const contrast = (one: Rgb, other: Rgb): number => {
  const [dark, light] = [luminance(one), luminance(other)].sort((x, y) => x - y)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** Every `--name: value;` declaration in a stylesheet, by name. */
export const declarations = (css: string): ReadonlyMap<string, string> =>
  new Map(
    [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [
      name,
      value.trim(),
    ]),
  )
