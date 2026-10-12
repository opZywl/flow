const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722]
const MIN_CONTRAST = 4.5

const luminance = (rgb: number[]) =>
  rgb.reduce((sum, channel, index) => {
    const value = channel / 255
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return sum + LUMINANCE_WEIGHTS[index] * linear
  }, 0)

export function readableChannels(hex: string): number[] {
  let rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
  while (1.05 / (luminance(rgb) + 0.05) < MIN_CONTRAST) rgb = rgb.map((channel) => Math.floor(channel * 0.97))
  return rgb
}
