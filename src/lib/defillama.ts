import { z } from 'zod'
import { db } from '../db/db'
import type { PriceRow } from '../core/types'
import { mapLimit } from './ratelimit'

const CURRENT_URL = 'https://coins.llama.fi/prices/current/'
const CHART_URL = 'https://coins.llama.fi/chart/'

const currentSchema = z.object({
  coins: z.record(z.object({ price: z.number() })),
})

const chartSchema = z.object({
  coins: z.record(
    z.object({
      prices: z.array(z.object({ timestamp: z.number(), price: z.number() })),
    }),
  ),
})

/** 現在価格。priceKey = "ethereum:0x..." / "coingecko:ethereum" 形式。取れなかったキーは結果に含まれない */
export async function fetchCurrentPrices(priceKeys: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const chunks: string[][] = []
  for (let i = 0; i < priceKeys.length; i += 25) chunks.push(priceKeys.slice(i, i + 25))
  await mapLimit(chunks, 3, async (chunk) => {
    try {
      const res = await fetch(CURRENT_URL + chunk.join(','))
      if (!res.ok) return
      const body = currentSchema.parse(await res.json())
      for (const [key, v] of Object.entries(body.coins)) result.set(key, v.price)
    } catch {
      // 価格欠損として扱う(仕様v0.2 §8.2)
    }
  })
  return result
}

function dateKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

/**
 * 日次の過去価格を取得する。IndexedDBキャッシュ済みの日はAPIを呼ばない。
 * 返り値: `${priceKey}:${date}` → USD価格
 */
export async function fetchDailyPrices(
  priceKeys: string[],
  startTs: number,
  endTs: number,
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const days = Math.max(1, Math.ceil((endTs - startTs) / 86400) + 1)

  // キャッシュ確認
  const need: string[] = []
  for (const pk of priceKeys) {
    const cached = await db.prices.where('priceKey').equals(pk).toArray()
    const cachedDates = new Set(cached.map((c) => c.date))
    for (const c of cached) result.set(`${pk}:${c.date}`, c.priceUsd)
    let missing = 0
    for (let d = 0; d < days; d++) {
      if (!cachedDates.has(dateKey(startTs + d * 86400))) missing++
    }
    // 当日分は常に取り直す(終値が未確定のため)
    if (missing > 1 || !cachedDates.has(dateKey(endTs))) need.push(pk)
  }

  const toStore: PriceRow[] = []
  await mapLimit(need, 3, async (pk) => {
    try {
      const qs = new URLSearchParams({
        start: String(startTs),
        span: String(Math.min(days, 1000)),
        period: '1d',
      })
      const res = await fetch(`${CHART_URL}${encodeURIComponent(pk)}?${qs}`)
      if (!res.ok) return
      const body = chartSchema.parse(await res.json())
      const series = body.coins[pk]
      if (!series) return
      for (const p of series.prices) {
        const date = dateKey(p.timestamp)
        result.set(`${pk}:${date}`, p.price)
        toStore.push({ key: `${pk}:${date}`, priceKey: pk, date, priceUsd: p.price })
      }
    } catch {
      // 価格欠損として扱う
    }
  })
  if (toStore.length > 0) await db.prices.bulkPut(toStore)
  return result
}
