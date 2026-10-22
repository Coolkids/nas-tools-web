export const MAX_DURATION_SECONDS = 36500 * 86400
export const durationUnits = [
  { label: '秒', value: 'second', factor: 1 },
  { label: '分钟', value: 'minute', factor: 60 },
  { label: '小时', value: 'hour', factor: 3600 },
  { label: '天', value: 'day', factor: 86400 }
] as const
export type DurationUnit = typeof durationUnits[number]['value']

/** Decimal arithmetic, including scientific notation, without rounding. */
export function toDurationSeconds(value: string | number, unit: DurationUnit,
  minimum = 1, maximum = MAX_DURATION_SECONDS): number {
  const raw = String(value).trim()
  const match = /^\+?(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(raw)
  const factor = durationUnits.find(item => item.value === unit)?.factor
  if (!match || !factor || raw.length > 64) throw new Error('请输入有效时长')
  const exponent = Number(match[2] || 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 20) throw new Error('时长超出允许范围')
  const [whole, fraction = ''] = match[1].split('.')
  let numerator = BigInt((whole || '0') + fraction) * BigInt(factor)
  let denominator = 10n ** BigInt(fraction.length)
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent)
  else denominator *= 10n ** BigInt(-exponent)
  if (numerator % denominator !== 0n) throw new Error('时长必须精确为整数秒，不能四舍五入')
  const seconds = Number(numerator / denominator)
  if (!Number.isSafeInteger(seconds) || seconds < minimum || seconds > maximum) {
    throw new Error(`时长须为 ${minimum} 秒至 36500 天`)
  }
  return seconds
}

export function preferredDurationUnit(seconds: number): DurationUnit {
  return [...durationUnits].reverse().find(item => seconds > 0 && seconds % item.factor === 0)?.value || 'second'
}

export function durationInUnit(seconds: number, unit: DurationUnit): string {
  const factor = durationUnits.find(item => item.value === unit)!.factor
  // Only presentation changes. The component retains the exact canonical
  // seconds while showing a recurring fraction until the user edits it.
  return Number((seconds / factor).toPrecision(14)).toString()
}

export function formatDuration(seconds: number, forever = true): string {
  if (seconds === 0 && forever) return '不过期'
  const unit = preferredDurationUnit(seconds)
  return `${durationInUnit(seconds, unit)} ${durationUnits.find(item => item.value === unit)!.label}`
}
