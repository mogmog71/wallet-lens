import type { ChainConfig } from '../config/chains'
import { rawToNumber, utcDate } from '../lib/format'
import type { RawData } from './fetcher'
import type { DailyPoint, TokenQuality } from './types'

/**
 * 日次の資産増減(符号付きBigInt)を組み立てる。
 * ガス代は送信者のtxで必ず控除する(失敗tx含む。仕様v0.2 §6.2)。
 * internal txのvalueを含める(仕様v0.2 §7.5)。
 */
export function buildDailyDeltas(
  raw: RawData,
  wallet: string,
): Map<string, Map<string, bigint>> {
  const days = new Map<string, Map<string, bigint>>()
  const add = (ts: number, token: string, v: bigint) => {
    if (v === 0n) return
    const d = utcDate(ts)
    let m = days.get(d)
    if (!m) {
      m = new Map()
      days.set(d, m)
    }
    m.set(token, (m.get(token) ?? 0n) + v)
  }

  for (const tx of raw.txs) {
    if (tx.from === wallet) {
      // ガスは成功・失敗を問わず消費される
      add(tx.timeStamp, 'native', -(BigInt(tx.gasUsed || '0') * BigInt(tx.gasPrice || '0')))
      if (!tx.isError) add(tx.timeStamp, 'native', -BigInt(tx.value || '0'))
    }
    if (tx.to === wallet && !tx.isError) add(tx.timeStamp, 'native', BigInt(tx.value || '0'))
  }
  for (const it of raw.internals) {
    if (it.isError) continue
    if (it.to === wallet) add(it.timeStamp, 'native', BigInt(it.value || '0'))
    if (it.from === wallet) add(it.timeStamp, 'native', -BigInt(it.value || '0'))
  }
  for (const t of raw.transfers) {
    if (t.standard !== 'erc20') continue // NFTは資産評価から除外(仕様v0.3 §6)
    if (t.to === wallet) add(t.timeStamp, t.tokenAddress, BigInt(t.amountRaw || '0'))
    if (t.from === wallet) add(t.timeStamp, t.tokenAddress, -BigInt(t.amountRaw || '0'))
  }
  return days
}

function dateRange(startTs: number, endTs: number): string[] {
  const out: string[] = []
  const start = new Date(utcDate(startTs) + 'T00:00:00Z').getTime()
  const end = new Date(utcDate(endTs) + 'T00:00:00Z').getTime()
  for (let t = start; t <= end; t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export interface ChainReconstruction {
  chainId: number
  daily: { date: string; perToken: Map<string, number> }[] // token → USD
  tokens: TokenQuality[]
}

/**
 * 逆算方式(仕様v0.2 §8.1): 現在残高から新しい順に移動を巻き戻し、
 * 各日付末の残高×その日のUSD価格で評価額を復元する。
 * スパムトークンは常に評価から除外(仕様v0.2 §5.4)。
 */
export function reconstructChain(params: {
  chain: ChainConfig
  wallet: string
  raw: RawData
  currentNative: bigint
  currentTokens: Map<string, bigint>
  spamTokens: Set<string>
  tokenMeta: Map<string, { symbol: string; decimals: number }>
  dailyPrices: Map<string, number> // `${priceKey}:${date}` → USD
  currentPrices: Map<string, number> // priceKey → USD
  startTs: number
}): ChainReconstruction {
  const { chain, raw, wallet } = params
  const deltas = buildDailyDeltas(raw, wallet)
  const nowTs = Math.floor(Date.now() / 1000)
  const dates = dateRange(params.startTs, nowTs)
  const today = utcDate(nowTs)

  // 評価対象トークン: native + 期間中に登場 or 現在保有している非スパムERC20
  const tokenSet = new Set<string>(['native'])
  for (const m of deltas.values()) for (const k of m.keys()) tokenSet.add(k)
  for (const k of params.currentTokens.keys()) tokenSet.add(k)
  for (const s of params.spamTokens) tokenSet.delete(s)

  const priceKeyOf = (token: string) =>
    token === 'native' ? chain.nativePriceKey : `${chain.llamaChain}:${token}`

  const tokens: TokenQuality[] = []
  // token → date → 残高(BigInt)
  const balances = new Map<string, Map<string, bigint>>()

  for (const token of tokenSet) {
    const current =
      token === 'native' ? params.currentNative : (params.currentTokens.get(token) ?? 0n)
    const series = new Map<string, bigint>()
    let bal = current
    let incomplete = false
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dates[i]
      series.set(d, bal)
      if (bal < 0n) incomplete = true
      const delta = deltas.get(d)?.get(token) ?? 0n
      bal -= delta // 巻き戻し: 前日末残高 = 当日末残高 − 当日増減
    }
    balances.set(token, series)

    const meta =
      token === 'native'
        ? { symbol: chain.nativeSymbol, decimals: 18 }
        : (params.tokenMeta.get(token) ?? { symbol: token.slice(0, 8), decimals: 18 })
    const pk = priceKeyOf(token)
    const curPrice = params.currentPrices.get(pk)
    tokens.push({
      chainId: chain.chainId,
      tokenAddress: token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      incomplete,
      priced: curPrice !== undefined || params.dailyPrices.has(`${pk}:${today}`),
      currentBalanceRaw: current.toString(),
      currentUsd: curPrice !== undefined ? rawToNumber(current, meta.decimals) * curPrice : undefined,
    })
  }

  // 日次評価額(価格はcarry-forward: その日の価格がなければ直近の過去価格を使う)
  const daily: ChainReconstruction['daily'] = []
  const lastPrice = new Map<string, number>()
  for (const date of dates) {
    const perToken = new Map<string, number>()
    for (const token of tokenSet) {
      const pk = priceKeyOf(token)
      let price = params.dailyPrices.get(`${pk}:${date}`)
      if (date === today && params.currentPrices.has(pk)) price = params.currentPrices.get(pk)
      if (price === undefined) price = lastPrice.get(pk)
      if (price === undefined) continue // 価格欠損 → 評価対象外(0円扱いにしない)
      lastPrice.set(pk, price)
      const bal = balances.get(token)?.get(date) ?? 0n
      if (bal <= 0n) continue // 負残高(データ欠損)は0として扱い、incompleteフラグで明示
      const meta = tokens.find((t) => t.tokenAddress === token)!
      perToken.set(token, rawToNumber(bal, meta.decimals) * price)
    }
    daily.push({ date, perToken })
  }

  return { chainId: chain.chainId, daily, tokens }
}

/** 複数チェーンの日次評価を合算する */
export function mergeChains(chains: ChainReconstruction[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  for (const c of chains) {
    for (const d of c.daily) {
      let p = byDate.get(d.date)
      if (!p) {
        p = { date: d.date, totalUsd: 0, perToken: {} }
        byDate.set(d.date, p)
      }
      for (const [token, usd] of d.perToken) {
        p.perToken[`${c.chainId}:${token}`] = (p.perToken[`${c.chainId}:${token}`] ?? 0) + usd
        p.totalUsd += usd
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
