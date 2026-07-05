import { createPublicClient, fallback, http, erc20Abi, type PublicClient } from 'viem'
import { getChain } from '../config/chains'
import { db } from '../db/db'
import type { ReceiptRow, TxRow } from '../core/types'
import { mapLimit } from './ratelimit'

const clients = new Map<number, PublicClient>()

export function getClient(chainId: number): PublicClient {
  let c = clients.get(chainId)
  if (!c) {
    const cfg = getChain(chainId)
    c = createPublicClient({
      chain: cfg.viemChain,
      transport: fallback(cfg.rpcUrls.map((u) => http(u, { batch: true }))),
    })
    clients.set(chainId, c)
  }
  return c
}

/** ネイティブ残高 + ERC20残高(multicall)を現在ブロックで取得(仕様v0.2 §4.2) */
export async function fetchCurrentBalances(
  chainId: number,
  wallet: `0x${string}`,
  tokenAddresses: string[],
): Promise<{ native: bigint; tokens: Map<string, bigint> }> {
  const client = getClient(chainId)
  const native = await client.getBalance({ address: wallet })
  const tokens = new Map<string, bigint>()
  if (tokenAddresses.length > 0) {
    const results = await client.multicall({
      contracts: tokenAddresses.map((addr) => ({
        address: addr as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [wallet] as const,
      })),
      allowFailure: true,
    })
    results.forEach((r, i) => {
      tokens.set(tokenAddresses[i], r.status === 'success' ? (r.result as bigint) : 0n)
    })
  }
  return { native, tokens }
}

/**
 * プロバイダ(Moralis)がinputを返さなかった送信txについて、RPCから
 * calldataを補完取得する(B-1: 「不明」分類の削減)。
 * 行を直接書き換えてIndexedDBにも保存し、inputCheckedで再照会を防ぐ。
 */
export async function enrichTxInputs(
  chainId: number,
  rows: TxRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const client = getClient(chainId)
  let done = 0
  await mapLimit(rows, 8, async (row) => {
    try {
      const tx = await client.getTransaction({ hash: row.hash as `0x${string}` })
      row.input = tx.input
      row.methodId = tx.input.slice(0, 10).toLowerCase()
    } catch {
      // 取得できなくても既存データのまま進める
    }
    row.inputChecked = true
    done++
    if (done % 10 === 0 || done === rows.length) onProgress?.(done, rows.length)
  })
  if (rows.length > 0) await db.txs.bulkPut(rows)
}

/**
 * Swap判定(方法A)用にreceiptをバッチ取得する。IndexedDBに永続キャッシュし、
 * 取得済みのtxはRPCを呼ばない。取得失敗したtxは undefined(方法Bにフォールバック)。
 */
export async function fetchReceipts(
  chainId: number,
  hashes: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ReceiptRow>> {
  const result = new Map<string, ReceiptRow>()
  const missing: string[] = []
  const cached = await db.receipts.bulkGet(hashes.map((h) => `${chainId}:${h}`))
  cached.forEach((row, i) => {
    if (row) result.set(hashes[i], row)
    else missing.push(hashes[i])
  })

  const client = getClient(chainId)
  let done = 0
  const fetched: ReceiptRow[] = []
  await mapLimit(missing, 8, async (hash) => {
    try {
      const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` })
      const row: ReceiptRow = {
        key: `${chainId}:${hash}`,
        chainId,
        hash,
        status: r.status === 'success' ? 'success' : 'reverted',
        logs: r.logs.map((l) => ({
          address: l.address.toLowerCase(),
          topics: [...l.topics],
          data: l.data,
        })),
      }
      result.set(hash, row)
      fetched.push(row)
    } catch {
      // 取得失敗 → 方法B(Transfer差分)にフォールバック
    }
    done++
    if (done % 10 === 0 || done === missing.length) onProgress?.(done, missing.length)
  })
  if (fetched.length > 0) await db.receipts.bulkPut(fetched)
  return result
}
