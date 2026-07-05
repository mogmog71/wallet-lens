import type { ChainConfig } from '../config/chains'
import type { InternalTxRow, TokenTransferRow, TxRow } from '../core/types'
import { sleep, TokenBucket } from './ratelimit'

// Moralis Wallet History プロバイダ(Base / Arbitrum 用)。
// 経緯: Etherscan V2の無料プランがEthereum以外のチェーンを提供しなくなり、
// Basescan/ArbiscanのV1 APIは廃止、Blockscoutはセキュリティソフトに
// ブラックリスト登録されているため、無料キー1個で複数チェーンを返す
// Moralisを採用する。tx本体・internal tx・ERC20/NFT転送・失敗txを
// 1エンドポイント(/wallets/{address}/history)で取得できる。

const BASE = 'https://deep-index.moralis.io/api/v2.2'
const PAGE_LIMIT = 100

// 無料プランは40k CU/日。スループットも控えめに 3 req/sec
const bucket = new TokenBucket(3, 3)

export class MoralisError extends Error {}

interface MoralisHistoryResponse {
  cursor?: string | null
  result?: MoralisTx[]
}

interface MoralisTx {
  hash: string
  block_number: string
  block_timestamp: string
  from_address: string
  to_address: string | null
  value: string
  gas_price?: string
  receipt_gas_used?: string
  receipt_status?: string
  receipt_contract_address?: string | null
  input?: string
  method_label?: string | null
  internal_transactions?: {
    from: string
    to: string | null
    value: string
  }[]
  erc20_transfers?: {
    address: string
    token_symbol?: string | null
    token_name?: string | null
    token_decimals?: string | null
    from_address: string
    to_address: string
    value: string
    possible_spam?: boolean
  }[]
  nft_transfers?: {
    token_address: string
    token_id?: string | null
    from_address: string
    to_address: string
    amount?: string | null
    contract_type?: string | null
    possible_spam?: boolean
  }[]
}

async function moralisRequest(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<MoralisHistoryResponse> {
  const qs = new URLSearchParams(params)
  const url = `${BASE}${path}?${qs}`
  for (let attempt = 0; attempt < 6; attempt++) {
    await bucket.take()
    let res: Response
    try {
      res = await fetch(url, { headers: { 'X-API-Key': apiKey } })
    } catch {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (res.status === 401) {
      throw new MoralisError('MoralisのAPIキーが無効です。設定画面で確認してください。')
    }
    if (!res.ok) {
      const body = await res.text()
      throw new MoralisError(`Moralis HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as MoralisHistoryResponse
  }
  throw new MoralisError('Moralisのレート制限が解消しませんでした。しばらく待って再実行してください。')
}

export interface MoralisRawData {
  txs: TxRow[]
  internals: InternalTxRow[]
  transfers: TokenTransferRow[]
}

/**
 * ウォレット履歴を新しい順のcursorページングで取得し、共通Row形式に正規化する。
 * block <= sinceBlock または timestamp < startTs に達したら打ち切る(差分取得用)。
 */
export async function fetchMoralisHistory(
  chain: ChainConfig,
  wallet: string,
  apiKey: string,
  sinceBlock: number,
  startTs: number,
  onPage?: (fetched: number) => void,
): Promise<MoralisRawData> {
  const chainParam = chain.moralisChain
  const out: MoralisRawData = { txs: [], internals: [], transfers: [] }
  let cursor: string | undefined
  let count = 0

  for (;;) {
    const params: Record<string, string> = {
      chain: chainParam,
      order: 'DESC',
      limit: String(PAGE_LIMIT),
      include_internal_transactions: 'true',
      from_date: new Date(startTs * 1000).toISOString(),
    }
    if (cursor) params.cursor = cursor
    const res = await moralisRequest(`/wallets/${wallet}/history`, params, apiKey)
    const items = res.result ?? []
    let stop = items.length === 0
    for (const it of items) {
      const block = Number(it.block_number)
      const ts = Math.floor(Date.parse(it.block_timestamp) / 1000)
      if (block <= sinceBlock || ts < startTs) {
        stop = true
        break
      }
      normalizeItem(chain.chainId, wallet, it, block, ts, out)
      count++
    }
    onPage?.(count)
    if (stop || !res.cursor) break
    cursor = res.cursor
  }
  return out
}

function normalizeItem(
  chainId: number,
  wallet: string,
  it: MoralisTx,
  blockNumber: number,
  timeStamp: number,
  out: MoralisRawData,
): void {
  const input = it.input && it.input !== '' ? it.input : '0x'
  out.txs.push({
    key: `${chainId}:${wallet}:${it.hash}`,
    chainId,
    wallet,
    hash: it.hash,
    blockNumber,
    timeStamp,
    from: (it.from_address ?? '').toLowerCase(),
    to: (it.to_address ?? '').toLowerCase(),
    value: it.value ?? '0',
    input,
    methodId: input.slice(0, 10).toLowerCase(),
    functionName: it.method_label ?? '',
    isError: it.receipt_status === '0',
    gasUsed: it.receipt_gas_used ?? '0',
    gasPrice: it.gas_price ?? '0',
    contractAddress: (it.receipt_contract_address ?? '').toLowerCase(),
  })

  it.internal_transactions?.forEach((t, i) => {
    out.internals.push({
      key: `${chainId}:${wallet}:${it.hash}:${i}`,
      chainId,
      wallet,
      hash: it.hash,
      blockNumber,
      timeStamp,
      idx: i,
      from: (t.from ?? '').toLowerCase(),
      to: (t.to ?? '').toLowerCase(),
      value: t.value ?? '0',
      isError: false, // Moralisのinternalには成否フラグがない。失敗txはtx側で除外される
    })
  })

  it.erc20_transfers?.forEach((t, i) => {
    out.transfers.push({
      key: `${chainId}:${wallet}:${it.hash}:erc20:${i}`,
      chainId,
      wallet,
      hash: it.hash,
      blockNumber,
      timeStamp,
      idx: i,
      from: (t.from_address ?? '').toLowerCase(),
      to: (t.to_address ?? '').toLowerCase(),
      tokenAddress: (t.address ?? '').toLowerCase(),
      tokenSymbol: t.token_symbol ?? '',
      tokenName: t.token_name ?? '',
      tokenDecimal: Number(t.token_decimals ?? 18),
      amountRaw: t.value ?? '0',
      standard: 'erc20',
      providerSpam: t.possible_spam === true,
    })
  })

  it.nft_transfers?.forEach((t, i) => {
    const standard = t.contract_type === 'ERC1155' ? 'erc1155' : 'erc721'
    out.transfers.push({
      key: `${chainId}:${wallet}:${it.hash}:${standard}:${i}`,
      chainId,
      wallet,
      hash: it.hash,
      blockNumber,
      timeStamp,
      idx: i,
      from: (t.from_address ?? '').toLowerCase(),
      to: (t.to_address ?? '').toLowerCase(),
      tokenAddress: (t.token_address ?? '').toLowerCase(),
      tokenSymbol: '',
      tokenName: '',
      tokenDecimal: 0,
      amountRaw: t.amount ?? '1',
      standard,
      tokenId: t.token_id ?? undefined,
      providerSpam: t.possible_spam === true,
    })
  })
}
