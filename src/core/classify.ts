import type { ChainConfig } from '../config/chains'
import {
  APPROVE_SELECTORS,
  CLAIM_NAME_PATTERNS,
  SELECTORS,
  SWAP_EVENT_TOPICS,
} from '../config/signatures'
import { findLabel } from '../data/seedLabels'
import { formatAmount, shortAddr } from '../lib/format'
import type { RawData } from './fetcher'
import type {
  AssetAmount,
  DecodedAction,
  InternalTxRow,
  ReceiptRow,
  TokenRow,
  TokenTransferRow,
  TxRow,
} from './types'

export interface TxGroup {
  hash: string
  timeStamp: number
  blockNumber: number
  tx?: TxRow
  transfers: TokenTransferRow[]
  internals: InternalTxRow[]
}

/** raw dataをtx hash単位にまとめる。入金のみのtx(txlistに現れない)も1グループになる */
export function groupByHash(raw: RawData): TxGroup[] {
  const map = new Map<string, TxGroup>()
  const get = (hash: string, ts: number, block: number): TxGroup => {
    let g = map.get(hash)
    if (!g) {
      g = { hash, timeStamp: ts, blockNumber: block, transfers: [], internals: [] }
      map.set(hash, g)
    }
    return g
  }
  for (const t of raw.txs) get(t.hash, t.timeStamp, t.blockNumber).tx = t
  for (const t of raw.transfers) get(t.hash, t.timeStamp, t.blockNumber).transfers.push(t)
  for (const t of raw.internals) get(t.hash, t.timeStamp, t.blockNumber).internals.push(t)
  return [...map.values()].sort((a, b) => a.timeStamp - b.timeStamp)
}

const MAX_HALF = 2n ** 255n

function methodNameOf(tx: TxRow | undefined): string | undefined {
  if (!tx) return undefined
  const fn = tx.functionName?.split('(')[0]?.trim()
  if (fn) return fn
  if (tx.methodId && tx.methodId !== '0x' && tx.input !== '0x') return tx.methodId
  return undefined
}

/** Swap判定候補(receipt取得対象): 同一txで資産のin/outが両方ある */
export function isSwapCandidate(group: TxGroup, wallet: string): boolean {
  if (!group.tx || group.tx.from !== wallet || group.tx.isError) return false
  const { deltas } = computeDeltas(group, wallet)
  let hasIn = false
  let hasOut = false
  for (const v of deltas.values()) {
    if (v > 0n) hasIn = true
    if (v < 0n) hasOut = true
  }
  return hasIn && hasOut
}

interface Deltas {
  /** 'native' または tokenAddress → 符号付き増減(BigInt) */
  deltas: Map<string, bigint>
  nftIn: TokenTransferRow[]
  nftOut: TokenTransferRow[]
  tokenMeta: Map<string, { symbol: string; decimals: number }>
}

function computeDeltas(group: TxGroup, wallet: string): Deltas {
  const deltas = new Map<string, bigint>()
  const add = (k: string, v: bigint) => deltas.set(k, (deltas.get(k) ?? 0n) + v)
  const tokenMeta = new Map<string, { symbol: string; decimals: number }>()
  const nftIn: TokenTransferRow[] = []
  const nftOut: TokenTransferRow[] = []

  const tx = group.tx
  if (tx && !tx.isError) {
    const v = BigInt(tx.value || '0')
    if (v > 0n) {
      if (tx.from === wallet) add('native', -v)
      if (tx.to === wallet) add('native', v)
    }
  }
  for (const it of group.internals) {
    if (it.isError) continue
    const v = BigInt(it.value || '0')
    if (v === 0n) continue
    if (it.to === wallet) add('native', v)
    if (it.from === wallet) add('native', -v)
  }
  for (const t of group.transfers) {
    if (t.standard !== 'erc20') {
      if (t.to === wallet) nftIn.push(t)
      if (t.from === wallet) nftOut.push(t)
      continue
    }
    tokenMeta.set(t.tokenAddress, { symbol: t.tokenSymbol, decimals: t.tokenDecimal })
    const v = BigInt(t.amountRaw || '0')
    if (t.to === wallet) add(t.tokenAddress, v)
    if (t.from === wallet) add(t.tokenAddress, -v)
  }
  return { deltas, nftIn, nftOut, tokenMeta }
}

function toAssets(
  d: Deltas,
  chain: ChainConfig,
  spamTokens: Map<string, TokenRow>,
): { assetsIn: AssetAmount[]; assetsOut: AssetAmount[] } {
  const assetsIn: AssetAmount[] = []
  const assetsOut: AssetAmount[] = []
  for (const [key, v] of d.deltas) {
    if (v === 0n) continue
    const isNative = key === 'native'
    const meta = isNative
      ? { symbol: chain.nativeSymbol, decimals: 18 }
      : (d.tokenMeta.get(key) ?? { symbol: shortAddr(key), decimals: 18 })
    const asset: AssetAmount = {
      tokenAddress: key,
      symbol: meta.symbol || shortAddr(key),
      decimals: meta.decimals,
      amountRaw: (v < 0n ? -v : v).toString(),
      isSpam: !isNative && (spamTokens.get(key)?.isSpam ?? false),
      standard: isNative ? 'native' : 'erc20',
    }
    ;(v > 0n ? assetsIn : assetsOut).push(asset)
  }
  for (const t of d.nftIn.concat(d.nftOut)) {
    const asset: AssetAmount = {
      tokenAddress: t.tokenAddress,
      symbol: t.tokenSymbol || 'NFT',
      decimals: 0,
      amountRaw: t.amountRaw,
      isSpam: false,
      standard: t.standard as 'erc721' | 'erc1155',
    }
    ;(d.nftIn.includes(t) ? assetsIn : assetsOut).push(asset)
  }
  return { assetsIn, assetsOut }
}

function assetsText(assets: AssetAmount[]): string {
  return assets
    .slice(0, 3)
    .map((a) => `${formatAmount(a.amountRaw, a.decimals)} ${a.symbol}`)
    .join(' + ') + (assets.length > 3 ? ` ほか${assets.length - 3}件` : '')
}

/**
 * 1txを1つのprimary actionに分類する(仕様v0.2 §6.2の優先順位)。
 * 複数アクションのsub-action分解はPhase 3。assetsIn/Outに全資産移動を保持する。
 */
export function classifyTx(
  group: TxGroup,
  wallet: string,
  chain: ChainConfig,
  receipt: ReceiptRow | undefined,
  spamTokens: Map<string, TokenRow>,
): DecodedAction {
  const tx = group.tx
  const d = computeDeltas(group, wallet)
  const { assetsIn, assetsOut } = toAssets(d, chain, spamTokens)
  const status: 'success' | 'failed' = tx?.isError ? 'failed' : 'success'
  const methodName = methodNameOf(tx)
  const isSender = !!tx && tx.from === wallet
  const gasFeeNative = isSender
    ? (BigInt(tx!.gasUsed || '0') * BigInt(tx!.gasPrice || '0')).toString()
    : '0'

  const counterparty = tx
    ? tx.from === wallet
      ? tx.to
      : tx.from
    : group.transfers[0]
      ? group.transfers[0].from === wallet
        ? group.transfers[0].to
        : group.transfers[0].from
      : group.internals[0]?.from

  const label = findLabel(chain.chainId, counterparty)

  const base = {
    chainId: chain.chainId,
    txHash: group.hash,
    timeStamp: group.timeStamp,
    blockNumber: group.blockNumber,
    status,
    counterparty,
    counterpartyLabel: label?.name,
    methodName,
    assetsIn,
    assetsOut,
    gasFeeNative,
    involvesSpamOnly:
      assetsIn.length + assetsOut.length > 0 &&
      [...assetsIn, ...assetsOut].every((a) => a.isSpam),
  }

  // 1. Contract Deployment
  if (tx && isSender && !tx.to) {
    return {
      ...base,
      actionType: 'deployment',
      summary: `コントラクトを作成しました(${shortAddr(tx.contractAddress)})`,
      confidence: 'high',
      reason: 'to空欄 + contractAddress',
    }
  }

  // 2. Wrap / Unwrap(Swapより先に判定して誤分類を防ぐ)
  if (tx && isSender && tx.to === chain.wrappedNative) {
    if (tx.methodId === SELECTORS.wethDeposit || (tx.input === '0x' && BigInt(tx.value || '0') > 0n)) {
      const amt = formatAmount(tx.value, 18)
      return {
        ...base,
        actionType: 'wrap',
        protocolName: 'WETH',
        summary: `${amt} ${chain.nativeSymbol} を WETH にラップしました`,
        confidence: 'high',
        reason: 'wrapped nativeへのdeposit()',
      }
    }
    if (tx.methodId === SELECTORS.wethWithdraw) {
      const amt = assetsIn[0] ? formatAmount(assetsIn[0].amountRaw, 18) : ''
      return {
        ...base,
        actionType: 'unwrap',
        protocolName: 'WETH',
        summary: `WETH を ${amt} ${chain.nativeSymbol} に戻しました(アンラップ)`,
        confidence: 'high',
        reason: 'wrapped nativeへのwithdraw()',
      }
    }
  }

  // 3. Approve
  if (tx && isSender && APPROVE_SELECTORS.has(tx.methodId)) {
    const input = tx.input
    const spender = input.length >= 74 ? `0x${input.slice(34, 74)}`.toLowerCase() : undefined
    let unlimited = false
    if (tx.methodId === SELECTORS.approve && input.length >= 138) {
      try {
        unlimited = BigInt(`0x${input.slice(74, 138)}`) >= MAX_HALF
      } catch { /* 解析不能は無視 */ }
    }
    const tokenRow = spamTokens.get(tx.to)
    const tokenName = tokenRow?.symbol || shortAddr(tx.to)
    const spenderLabel = findLabel(chain.chainId, spender)?.name ?? shortAddr(spender)
    return {
      ...base,
      actionType: 'approve',
      summary: unlimited
        ? `${tokenName} の無制限の利用許可を ${spenderLabel} に出しました`
        : `${tokenName} の利用許可を ${spenderLabel} に出しました`,
      confidence: 'high',
      reason: `メソッドセレクタ ${tx.methodId}`,
    }
  }

  const hasIn = assetsIn.some((a) => a.standard === 'native' || a.standard === 'erc20')
  const hasOut = assetsOut.some((a) => a.standard === 'native' || a.standard === 'erc20')

  // 4. Swap 方法A: Event Log判定(High)
  if (receipt && status === 'success') {
    const hit = receipt.logs.find((l) => l.topics[0] && SWAP_EVENT_TOPICS[l.topics[0]])
    if (hit && hasIn && hasOut) {
      const protocol = SWAP_EVENT_TOPICS[hit.topics[0]]
      return {
        ...base,
        actionType: 'swap',
        protocolName: protocol,
        summary: `${assetsText(assetsOut)} を ${assetsText(assetsIn)} に交換しました`,
        confidence: 'high',
        reason: `Swapイベントログ一致(${protocol})`,
      }
    }
  }

  // 5. Bridge(seed.jsonラベル一致)
  if (label?.category === 'bridge') {
    const dir = hasOut ? '送金しました(ブリッジ出金)' : '受け取りました(ブリッジ入金)'
    return {
      ...base,
      actionType: 'bridge',
      protocolName: label.name,
      summary: `${label.name} で資産を${dir}`,
      confidence: 'high',
      reason: `Bridgeラベル一致: ${label.name}`,
    }
  }

  // 4'. Swap 方法B: Transfer差分推定(Medium)
  if (tx && isSender && hasIn && hasOut && tx.input !== '0x' && status === 'success') {
    return {
      ...base,
      actionType: 'swap',
      summary: `${assetsText(assetsOut)} を ${assetsText(assetsIn)} に交換しました(推定)`,
      confidence: 'medium',
      reason: 'Transfer差分(同一txで資産のin/out)',
    }
  }

  // 6. Claim / Reward(粗い推定)
  if (tx && isSender && methodName && hasIn && !hasOut) {
    const fn = methodName.toLowerCase()
    if (CLAIM_NAME_PATTERNS.some((p) => fn.includes(p))) {
      return {
        ...base,
        actionType: 'claim',
        summary: `${assetsText(assetsIn)} を請求(claim)しました`,
        confidence: 'medium',
        reason: `関数名: ${methodName}`,
      }
    }
  }

  // 7. Transfer
  const nftOnly = (d.nftIn.length > 0 || d.nftOut.length > 0) && !hasIn && !hasOut
  if (nftOnly) {
    const isIn = d.nftIn.length > 0
    return {
      ...base,
      actionType: 'nft_transfer',
      summary: isIn
        ? `NFT ${assetsText(assetsIn)} を受け取りました`
        : `NFT ${assetsText(assetsOut)} を送りました`,
      confidence: 'medium',
      reason: 'ERC721/1155 Transfer',
    }
  }
  if (tx && isSender && tx.to === wallet) {
    return {
      ...base,
      actionType: 'transfer_self',
      summary: '自分自身への送金です',
      confidence: 'high',
      reason: 'from = to = 対象アドレス',
    }
  }
  if (hasIn !== hasOut) {
    const isIn = hasIn
    const assets = isIn ? assetsIn : assetsOut
    const cpLabel = label?.category === 'cex' ? `${label.name}(CEX)` : undefined
    const cp = cpLabel ?? shortAddr(counterparty)
    // 純粋な送金か、コントラクト呼び出し付きかで文言と確信度を変える
    const simple = !tx || tx.input === '0x' || /^transfer/i.test(methodName ?? '')
    if (simple || !isSender) {
      return {
        ...base,
        actionType: isIn ? 'transfer_in' : 'transfer_out',
        summary: isIn
          ? `${assetsText(assets)} を ${cp} から受け取りました`
          : `${assetsText(assets)} を ${cp} に送りました`,
        confidence: simple ? 'high' : 'medium',
        reason: simple ? '単純送金' : 'コントラクト経由の一方向の資産移動',
      }
    }
  }

  // 10. Unknown Contract Call
  const what = methodName ? `「${methodName}」を実行しました` : 'コントラクトを操作しました'
  return {
    ...base,
    actionType: 'unknown',
    summary:
      status === 'failed'
        ? `${what}(失敗)`
        : hasIn || hasOut
          ? `${what}(入: ${assetsText(assetsIn) || 'なし'} / 出: ${assetsText(assetsOut) || 'なし'})`
          : what,
    confidence: 'low',
    reason: methodName ? `関数名: ${methodName}` : '判定材料不足',
  }
}
