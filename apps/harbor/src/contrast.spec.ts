import { describe, expect, it } from 'vitest'

import { contrast, declarations, over, parseColor } from './contrast'

describe(parseColor, () => {
  it('reads hex', () => {
    expect(parseColor('#ff0080')).toStrictEqual([1, 0, 128 / 255])
  })

  it('reads oklch and lands on the same colour as its hex', () => {
    // Tailwind 3 shipped slate-900 as #0f172a, Tailwind 4 as this oklch.
    const [r, g, b] = parseColor('oklch(20.8% 0.042 265.755)')

    expect(Math.round(r * 255)).toBe(15)
    expect(Math.round(g * 255)).toBe(23)
    expect(Math.round(b * 255)).toBe(43)
  })

  it('takes lightness as a fraction as well as a percentage', () => {
    expect(parseColor('oklch(0.5 0 0)')).toStrictEqual(parseColor('oklch(50% 0 0)'))
  })

  it('names what it cannot read instead of guessing', () => {
    expect(() => parseColor('rgb(0 0 0)')).toThrow('Farbe nicht lesbar: rgb(0 0 0)')
  })
})

describe(contrast, () => {
  it('spans 1 to 21 and does not care about order', () => {
    const black = parseColor('#000000')
    const white = parseColor('#ffffff')

    expect(contrast(black, white)).toBeCloseTo(21)
    expect(contrast(white, black)).toBeCloseTo(21)
    expect(contrast(white, white)).toBe(1)
  })

  it('matches the WCAG reference for #767676 on white', () => {
    // The lightest grey that passes AA on white — the usual sanity check.
    expect(contrast(parseColor('#767676'), parseColor('#ffffff'))).toBeCloseTo(4.54, 2)
  })
})

describe(over, () => {
  it('mixes in encoded sRGB, like a browser', () => {
    expect(over(parseColor('#ffffff'), 0.5, parseColor('#000000'))).toStrictEqual([0.5, 0.5, 0.5])
  })
})

describe(declarations, () => {
  it('reads custom properties by name', () => {
    const css = '@theme {\n  --color-a: #000000;\n  --color-b:oklch(50% 0 0) ;\n}'

    expect(declarations(css)).toStrictEqual(
      new Map([
        ['--color-a', '#000000'],
        ['--color-b', 'oklch(50% 0 0)'],
      ]),
    )
  })
})
