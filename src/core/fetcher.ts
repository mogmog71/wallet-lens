import { usesEtherscan, type ChainConfig } from '../config/chains'
import { db, type ApiKeys } from '../db/db'
import { fetchAll, getBlockByTime, type ListAction } from '../lib/etherscan'
import { fetchMoralisHistory } from '../lib/moralis'
import { getClient } from '../lib/rpc'
import type { InternalTxRow, TokenTransferRow, TxRow, ProgressFn } from './types'

export interface RawData {
  txs: TxRow[]
  internals: InternalTxRow[]
  transfers: TokenTransferRow[]
}

// ---- Etherscan V2 プロバイダの正規化 ----

const ES_ENDPOINTS: ListAction[] = [
  'txlist',
  'txlistinternal',
  'tokentx',
  'tokennfttx',
  'token1155tx',
]

function normTx(chainId: number, wallet: string, r: Record<string, string>): TxRow {
  const input = r.input ?? '0x'
  return {
    key: `${chainId}:${wallet}:${r.hash}`,
    chainId,
    wallet,
    hash: r.hash,
    blockNumber: Number(r.blockNumber),
    timeStamp: Number(r.timeStamp),
    from: (r.from ?? '').toLowerCase(),
    to: (r.to ?? '').toLowerCase(),
    value: r.value ?? '0',
    input,
    methodId: (r.methodId && r.methodId !== '0x' ? r.methodId : input.slice(0, 10)).toLowerCase(),
    functionName: r.functionName ?? '',
    isError: r.isError === '1',
    gasUsed: r.gasUsed ?? '0',
    gasPrice: r.gasPrice ?? '0',
    contractAddress: (r.contractAddress ?? '').toLowerCase(),
  }
}

function normInternal(
  chainId: number,
  wallet: string,
  r: Record<string, string>,
  idx: number,
): InternalTxRow {
  return {
    key: `${chainId}:${wallet}:${r.hash}:${idx}`,
    chainId,
    wallet,
    hash: r.hash,
    blockNumber: Number(r.blockNumber),
    timeStamp: Number(r.timeStamp),
    idx,
    from: (r.from ?? '').toLowerCase(),
    to: (r.to ?? '').toLowerCase(),
    value: r.value ?? '0',
    isError: r.isError === '1',
  }
}

function normTransfer(
  chainId: number,
  wallet: string,
  r: Record<string, string>,
  idx: number,
  standard: 'erc20' | 'erc721' | 'erc1155',
): TokenTransferRow {
  return {
    key: `${chainId}:${wallet}:${r.hash}:${standard}:${idx}`,
    chainId,
    wallet,
    hash: r.hash,
    blockNumber: Number(r.blockNumber),
    timeStamp: Number(r.timeStamp),
    idx,
    from: (r.from ?? '').toLowerCase(),
    to: (r.to ?? '').toLowerCase(),
    tokenAddress: (r.contractAddress ?? '').toLowerCase(),
    tokenSymbol: r.tokenSymbol ?? '',
    tokenName: r.tokenName ?? '',
    tokenDecimal: Number(r.tokenDecimal || '0'),
    amountRaw:
      standard === 'erc20' ? (r.value ?? '0') : standard === 'erc1155' ? (r.tokenValue ?? '1') : '1',
    standard,
    tokenId: standard === 'erc20' ? undefined : r.tokenID,
  }
}

/** hash単位の出現順でidxを振る(Etherscanレスポンスにはid/logIndexがないため) */
function withPerHashIndex<T>(
  rows: Record<string, string>[],
  make: (r: Record<string, string>, idx: number) => T,
): T[] {
  const counter = new Map<string, number>()
  return rows.map((r) => {
    const n = counter.get(r.hash) ?? 0
    counter.set(r.hash, n + 1)
    return make(r, n)
  })
}

async function ensureEtherscanData(
  chain: ChainConfig,
  wallet: string,
  startTs: number,
  latestBlock: number,
  apiKey: string,
  onProgress: ProgressFn,
): Promise<void> {
  const chainId = chain.chainId
  const startBlock = (await getBlockByTime(chainId, startTs, 'after', apiKey)) ?? 0

  for (const endpoint of ES_ENDPOINTS) {
    const rangeKey = `${chainId}:${wallet}:${endpoint}`
    const range = await db.ranges.get(rangeKey)

    const gaps: [number, number][] = []
    if (!range) {
      gaps.push([startBlock, latestBlock])
    } else {
      if (startBlock < range.fromBlock) gaps.push([startBlock, range.fromBlock - 1])
      if (latestBlock > range.toBlock) gaps.push([range.toBlock + 1, latestBlock])
    }
    if (gaps.length === 0) continue

    for (const [from, to] of gaps) {
      if (from > to) continue
      onProgress(`取得中: ${endpoint}`, `ブロック ${from.toLocaleString()} 〜`)
      const rows = await fetchAll(chainId, endpoint, wallet, from, to, apiKey, (n) =>
        onProgress(`取得中: ${endpoint}`, `${n.toLocaleString()} 件`),
      )
      if (endpoint === 'txlist') {
        await db.txs.bulkPut(rows.map((r) => normTx(chainId, wallet, r)))
      } else if (endpoint === 'txlistinternal') {
        await db.internals.bulkPut(withPerHashIndex(rows, (r, i) => normInternal(chainId, wallet, r, i)))
      } else {
        const std = endpoint === 'tokentx' ? 'erc20' : endpoint === 'tokennfttx' ? 'erc721' : 'erc1155'
        await db.transfers.bulkPut(
          withPerHashIndex(rows, (r, i) => normTransfer(chainId, wallet, r, i, std)),
        )
      }
    }

    await db.ranges.put({
      key: rangeKey,
      chainId,
      wallet,
      endpoint,
      fromBlock: Math.min(startBlock, range?.fromBlock ?? startBlock),
      toBlock: latestBlock,
      fetchedAt: Date.now(),
    })
  }
}

// ---- Moralis プロバイダ ----

async function ensureMoralisData(
  chain: ChainConfig,
  wallet: string,
  startTs: number,
  latestBlock: number,
  apiKey: string,
  onProgress: ProgressFn,
): Promise<void> {
  const chainId = chain.chainId
  const rangeKey = `${chainId}:${wallet}:history`
  const range = await db.ranges.get(rangeKey)

  // 取得済み範囲が要求期間をカバーしていれば、前回のtoBlock以降だけ差分取得する。
  // 要求期間の方が古い場合は期間全体を取り直す(bulkPutで重複は上書きされる)
  let sinceBlock = 0
  if (range && (range.fromTs ?? Infinity) <= startTs) {
    if (range.toBlock >= latestBlock) return
    sinceBlock = range.toBlock
  }

  onProgress('取得中: ウォレット履歴', 'Moralisから取得しています')
  const data = await fetchMoralisHistory(chain, wallet, apiKey, sinceBlock, startTs, (n) =>
    onProgress('取得中: ウォレット履歴', `${n.toLocaleString()} 件`),
  )
  if (data.txs.length > 0) await db.txs.bulkPut(data.txs)
  if (data.internals.length > 0) await db.internals.bulkPut(data.internals)
  if (data.transfers.length > 0) await db.transfers.bulkPut(data.transfers)

  await db.ranges.put({
    key: rangeKey,
    chainId,
    wallet,
    endpoint: 'history',
    fromBlock: 0,
    toBlock: latestBlock,
    fromTs: Math.min(startTs, range?.fromTs ?? startTs),
    fetchedAt: Date.now(),
  })
}

/**
 * startTs以降〜最新ブロックまでのraw dataをIndexedDBに揃える。
 * 取得済み範囲(ranges)は再取得しない(仕様v0.2 §4.4 / 逆算方式のため常に最新まで取る)。
 * プロバイダはチェーンごとに切り替える(仕様v0.3改: Etherscan / Moralis)。
 */
export async function ensureRawData(
  chain: ChainConfig,
  wallet: string,
  startTs: number,
  keys: ApiKeys,
  onProgress: ProgressFn,
): Promise<void> {
  const latestBlock = Number(await getClient(chain.chainId).getBlockNumber())
  if (usesEtherscan(chain, keys.etherscan)) {
    await ensureEtherscanData(chain, wallet, startTs, latestBlock, keys.etherscan, onProgress)
  } else {
    await ensureMoralisData(chain, wallet, startTs, latestBlock, keys.moralis, onProgress)
  }
}

/**
 * Moralis由来のinternal txに混入するトップレベルcall(tx本体と同じ from/to/value)を
 * 除外する。tx.valueとの二重計上防止。過去に取得済みのキャッシュにも混入しているため、
 * 取得時(moralis.ts)だけでなく読み出し時にも適用して既存キャッシュを救済する。
 */
function dropRootCallInternals(txs: TxRow[], internals: InternalTxRow[]): InternalTxRow[] {
  const txByHash = new Map(txs.map((t) => [t.hash, t]))
  const dropped = new Set<string>()
  return internals.filter((it) => {
    if (dropped.has(it.hash)) return true
    const tx = txByHash.get(it.hash)
    if (
      tx &&
      it.value !== '0' &&
      it.value === tx.value &&
      it.from === tx.from &&
      it.to === tx.to
    ) {
      dropped.add(it.hash)
      return false
    }
    return true
  })
}

/** IndexedDBからraw dataを読み出す(startTs以降のみ) */
export async function loadRawData(
  chainId: number,
  wallet: string,
  startTs: number,
): Promise<RawData> {
  const [txs, internals, transfers] = await Promise.all([
    db.txs.where('[chainId+wallet]').equals([chainId, wallet]).toArray(),
    db.internals.where('[chainId+wallet]').equals([chainId, wallet]).toArray(),
    db.transfers.where('[chainId+wallet]').equals([chainId, wallet]).toArray(),
  ])
  const inRangeTxs = txs
    .filter((r) => r.timeStamp >= startTs)
    .sort((a, b) => a.timeStamp - b.timeStamp)
  return {
    txs: inRangeTxs,
    internals: dropRootCallInternals(
      inRangeTxs,
      internals.filter((r) => r.timeStamp >= startTs).sort((a, b) => a.timeStamp - b.timeStamp),
    ),
    transfers: transfers.filter((r) => r.timeStamp >= startTs).sort((a, b) => a.timeStamp - b.timeStamp),
  }
}
