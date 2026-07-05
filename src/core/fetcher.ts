import { db } from '../db/db'
import { fetchAll, getBlockByTime, type ListAction } from '../lib/etherscan'
import { getClient } from '../lib/rpc'
import type { InternalTxRow, TokenTransferRow, TxRow, ProgressFn } from './types'

export interface RawData {
  txs: TxRow[]
  internals: InternalTxRow[]
  transfers: TokenTransferRow[]
}

const ENDPOINTS: ListAction[] = ['txlist', 'txlistinternal', 'tokentx', 'tokennfttx', 'token1155tx']

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

/**
 * startTs以降〜最新ブロックまでのraw dataをIndexedDBに揃える。
 * 取得済み範囲(ranges)は再取得しない(仕様v0.2 §4.4 / 逆算方式のため常に最新まで取る)。
 */
export async function ensureRawData(
  chainId: number,
  wallet: string,
  startTs: number,
  apiKey: string,
  onProgress: ProgressFn,
): Promise<void> {
  const client = getClient(chainId)
  const latestBlock = Number(await client.getBlockNumber())
  const startBlock = (await getBlockByTime(chainId, startTs, 'after', apiKey)) ?? 0

  for (const endpoint of ENDPOINTS) {
    const rangeKey = `${chainId}:${wallet}:${endpoint}`
    const range = await db.ranges.get(rangeKey)

    // 取得すべき区間を決める(既存範囲の前方拡張・後方拡張)
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
  return {
    txs: txs.filter((r) => r.timeStamp >= startTs).sort((a, b) => a.timeStamp - b.timeStamp),
    internals: internals.filter((r) => r.timeStamp >= startTs).sort((a, b) => a.timeStamp - b.timeStamp),
    transfers: transfers.filter((r) => r.timeStamp >= startTs).sort((a, b) => a.timeStamp - b.timeStamp),
  }
}
