import type { RawData } from './fetcher'
import type { TokenRow } from './types'

const LURE_PATTERN =
  /(https?:|www\.|\.com|\.io|\.xyz|\.net|\.org|\.site|\.app\b|claim|visit|reward|airdrop|bonus|gift|voucher)/i
const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u

/**
 * スパムトークン判定(仕様v0.3 §4)。2条件以上該当でスパム。
 * - price_unavailable: DefiLlamaで現在価格が取れない
 * - passive_only: 対象アドレスがこのトークンを一度も能動的に操作していない
 * - lure_name: 名前にURL・絵文字・誘導文字列
 */
export function evaluateSpamTokens(
  chainId: number,
  wallet: string,
  raw: RawData,
  priceAvailable: Set<string>, // 価格が取れたtokenAddress(小文字)
  wrappedNative: string,
): TokenRow[] {
  const erc20 = raw.transfers.filter((t) => t.standard === 'erc20')
  const tokenMeta = new Map<string, { symbol: string; name: string; decimals: number }>()
  for (const t of erc20) {
    if (!tokenMeta.has(t.tokenAddress)) {
      tokenMeta.set(t.tokenAddress, {
        symbol: t.tokenSymbol,
        name: t.tokenName,
        decimals: t.tokenDecimal,
      })
    }
  }

  // 能動操作の判定材料
  const sentTokens = new Set(erc20.filter((t) => t.from === wallet).map((t) => t.tokenAddress))
  const calledContracts = new Set(raw.txs.filter((t) => t.from === wallet).map((t) => t.to))

  const rows: TokenRow[] = []
  for (const [addr, meta] of tokenMeta) {
    const reasons: string[] = []
    if (addr !== wrappedNative) {
      if (!priceAvailable.has(addr)) reasons.push('price_unavailable')
      if (!sentTokens.has(addr) && !calledContracts.has(addr)) reasons.push('passive_only')
      if (LURE_PATTERN.test(meta.name) || LURE_PATTERN.test(meta.symbol) ||
          EMOJI_PATTERN.test(meta.name) || EMOJI_PATTERN.test(meta.symbol)) {
        reasons.push('lure_name')
      }
    }
    rows.push({
      key: `${chainId}:${wallet}:${addr}`,
      chainId,
      wallet,
      tokenAddress: addr,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      isSpam: reasons.length >= 2,
      spamReasons: reasons,
      priceAvailable: priceAvailable.has(addr),
      updatedAt: Date.now(),
    })
  }
  return rows
}
