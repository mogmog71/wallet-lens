import { formatUnits } from 'viem'

/** BigInt生値 → 表示用文字列。表示直前のみdecimals調整する(仕様v0.2 §7.1) */
export function formatAmount(raw: string | bigint, decimals: number, maxFrac = 6): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0')
  const s = formatUnits(v < 0n ? -v : v, decimals)
  const [int, frac = ''] = s.split('.')
  const intFmt = Number(int) >= 1000 ? Number(int).toLocaleString('en-US') : int
  const fracTrimmed = frac.slice(0, maxFrac).replace(/0+$/, '')
  return fracTrimmed ? `${intFmt}.${fracTrimmed}` : intFmt
}

/** 生値 → number(USD換算などの近似計算用。表示・集計のみに使う) */
export function rawToNumber(raw: string | bigint, decimals: number): number {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0')
  return Number(formatUnits(v, decimals))
}

export function formatUsd(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—'
  const abs = Math.abs(v)
  if (abs > 0 && abs < 0.01) return '<$0.01'
  return (
    (v < 0 ? '-$' : '$') +
    abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}

export function shortAddr(a: string | undefined | null): string {
  if (!a) return '—'
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

/** unix秒 → UTC日付キー YYYY-MM-DD */
export function utcDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isValidAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim())
}
