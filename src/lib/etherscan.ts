import { TokenBucket, sleep } from './ratelimit'

const BASE = 'https://api.etherscan.io/v2/api'
const PAGE_SIZE = 1000

// 無料枠 5 req/sec に対し 4 req/sec に抑える(仕様v0.2 §4.4)
const bucket = new TokenBucket(4, 4)

export class EtherscanError extends Error {}

interface EsResponse {
  status: string
  message: string
  result: unknown
}

async function esRequest(
  chainId: number,
  params: Record<string, string>,
  apiKey: string,
): Promise<unknown> {
  const qs = new URLSearchParams({ chainid: String(chainId), ...params, apikey: apiKey })
  const url = `${BASE}?${qs}`
  for (let attempt = 0; attempt < 6; attempt++) {
    await bucket.take()
    const res = await fetch(url)
    if (res.status === 429 || res.status >= 500) {
      await sleep(1200 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new EtherscanError(`Etherscan HTTP ${res.status}`)
    const body = (await res.json()) as EsResponse
    // 正常空: status "0" + "No transactions found"
    if (body.status === '0') {
      const msg = `${body.message} ${typeof body.result === 'string' ? body.result : ''}`
      if (/no transactions found|no records found/i.test(msg)) return []
      if (/rate limit/i.test(msg)) {
        await sleep(1200 * (attempt + 1))
        continue
      }
      if (/invalid api key|missing.*api key/i.test(msg)) {
        throw new EtherscanError('EtherscanのAPIキーが無効です。設定画面で確認してください。')
      }
      throw new EtherscanError(`Etherscan: ${msg}`)
    }
    return body.result
  }
  throw new EtherscanError('Etherscanのレート制限が解消しませんでした。しばらく待って再実行してください。')
}

/** unixタイムスタンプ → ブロック番号 */
export async function getBlockByTime(
  chainId: number,
  timestamp: number,
  closest: 'before' | 'after',
  apiKey: string,
): Promise<number | undefined> {
  try {
    const r = await esRequest(
      chainId,
      { module: 'block', action: 'getblocknobytime', timestamp: String(timestamp), closest },
      apiKey,
    )
    const n = Number(r)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined // 未来の時刻など。呼び出し側でlatest扱いにする
  }
}

export type ListAction = 'txlist' | 'txlistinternal' | 'tokentx' | 'tokennfttx' | 'token1155tx'

/**
 * リスト系エンドポイントを startblock カーソル方式で全件取得する。
 * page×offset≦10,000 の上限を回避するため、満杯ページの末尾ブロックを次回の
 * startblock に設定し、境界ブロックの行は前回分を捨てて取り直す(重複・欠落防止)。
 */
export async function fetchAll(
  chainId: number,
  action: ListAction,
  address: string,
  startBlock: number,
  endBlock: number,
  apiKey: string,
  onPage?: (fetched: number) => void,
): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = []
  let cursor = startBlock
  for (;;) {
    const rows = (await esRequest(
      chainId,
      {
        module: 'account',
        action,
        address,
        startblock: String(cursor),
        endblock: String(endBlock),
        page: '1',
        offset: String(PAGE_SIZE),
        sort: 'asc',
      },
      apiKey,
    )) as Record<string, string>[]
    if (!Array.isArray(rows) || rows.length === 0) break

    if (rows.length < PAGE_SIZE) {
      out.push(...rows)
      onPage?.(out.length)
      break
    }

    const lastBlock = Number(rows[rows.length - 1].blockNumber)
    const firstBlock = Number(rows[0].blockNumber)
    if (firstBlock === lastBlock) {
      // 1ブロックにPAGE_SIZE以上の行がある稀なケース。全件は取れないが前進する
      out.push(...rows)
      cursor = lastBlock + 1
    } else {
      // 末尾ブロックは分断されている可能性があるので捨てて、次回そのブロックから取り直す
      out.push(...rows.filter((r) => Number(r.blockNumber) !== lastBlock))
      cursor = lastBlock
    }
    onPage?.(out.length)
    if (cursor > endBlock) break
  }
  return out
}
