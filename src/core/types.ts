// ---- 正規化済みRawデータ(IndexedDBに保存する形。uint256生値はstringで保持) ----

export interface TxRow {
  /** `${chainId}:${wallet}:${hash}` */
  key: string
  chainId: number
  wallet: string
  hash: string
  blockNumber: number
  timeStamp: number
  from: string
  to: string // コントラクト作成時は ''
  value: string // wei, TEXT
  input: string
  methodId: string
  functionName: string
  isError: boolean
  gasUsed: string
  gasPrice: string
  contractAddress: string // デプロイされたコントラクト
}

export interface InternalTxRow {
  /** `${chainId}:${wallet}:${hash}:${idx}` */
  key: string
  chainId: number
  wallet: string
  hash: string
  blockNumber: number
  timeStamp: number
  idx: number
  from: string
  to: string
  value: string // wei, TEXT
  isError: boolean
}

export interface TokenTransferRow {
  /** `${chainId}:${wallet}:${hash}:${idx}` */
  key: string
  chainId: number
  wallet: string
  hash: string
  blockNumber: number
  timeStamp: number
  idx: number
  from: string
  to: string
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  tokenDecimal: number
  amountRaw: string // TEXT
  /** 'erc20' | 'erc721' | 'erc1155' */
  standard: 'erc20' | 'erc721' | 'erc1155'
  tokenId?: string
}

export interface TokenRow {
  /** `${chainId}:${wallet}:${tokenAddress}` */
  key: string
  chainId: number
  wallet: string
  tokenAddress: string
  symbol: string
  name: string
  decimals: number
  isSpam: boolean
  spamReasons: string[]
  priceAvailable: boolean
  updatedAt: number
}

export interface ReceiptRow {
  /** `${chainId}:${hash}` */
  key: string
  chainId: number
  hash: string
  status: 'success' | 'reverted'
  logs: { address: string; topics: string[]; data: string }[]
}

export interface PriceRow {
  /** `${priceKey}:${date}` 例 "ethereum:0xabc...:2026-06-01" / "coingecko:ethereum:2026-06-01" */
  key: string
  priceKey: string
  date: string // YYYY-MM-DD (UTC)
  priceUsd: number
}

export interface FetchRangeRow {
  /** `${chainId}:${wallet}:${endpoint}` */
  key: string
  chainId: number
  wallet: string
  endpoint: string
  fromBlock: number
  toBlock: number
  fetchedAt: number
}

// ---- 分類結果 ----

export type ActionType =
  | 'deployment'
  | 'wrap'
  | 'unwrap'
  | 'approve'
  | 'swap'
  | 'bridge'
  | 'claim'
  | 'transfer_in'
  | 'transfer_out'
  | 'transfer_self'
  | 'nft_transfer'
  | 'unknown'

export type Confidence = 'high' | 'medium' | 'low'

export interface AssetAmount {
  tokenAddress: string // 'native' はネイティブ通貨
  symbol: string
  decimals: number
  amountRaw: string // TEXT(絶対値)
  isSpam: boolean
  standard: 'native' | 'erc20' | 'erc721' | 'erc1155'
}

export interface DecodedAction {
  chainId: number
  txHash: string
  timeStamp: number
  blockNumber: number
  actionType: ActionType
  status: 'success' | 'failed'
  protocolName?: string
  counterparty?: string
  counterpartyLabel?: string
  methodName?: string
  summary: string
  assetsIn: AssetAmount[]
  assetsOut: AssetAmount[]
  amountUsd?: number
  gasFeeNative: string // wei, TEXT。自分が送信者のtxのみ。それ以外は '0'
  gasFeeUsd?: number
  confidence: Confidence
  reason: string
  /** スパムトークンのみが関与するアクション(デフォルト非表示対象) */
  involvesSpamOnly: boolean
}

// ---- ポートフォリオ ----

export interface DailyPoint {
  date: string
  totalUsd: number
  perToken: Record<string, number> // `${chainId}:${tokenAddress}` → USD
}

export interface TokenQuality {
  chainId: number
  tokenAddress: string
  symbol: string
  incomplete: boolean // 巻き戻しで負残高を検出(参考値)
  priced: boolean
  currentBalanceRaw: string
  decimals: number
  currentUsd?: number
}

export interface PortfolioResult {
  daily: DailyPoint[]
  tokens: TokenQuality[]
  coverage: { valued: number; total: number }
  currentTotalUsd: number
  periodStartUsd?: number
  periodEndUsd?: number
  externalInUsd: number
  externalOutUsd: number
  estimatedChangeUsd?: number
}

// ---- サマリー ----

export interface AnalysisSummary {
  address: string
  chains: number[]
  firstSeen?: number
  lastSeen?: number
  txCount: number
  gasFeeUsd: number
  gasFeeNativeByChain: Record<number, string>
  swapCount: number
  approveCount: number
  bridgeCount: number
  hasDeployment: boolean
  cexActivity: string[] // 一致したCEXラベル名
  topTokens: { symbol: string; count: number }[]
  topProtocols: { name: string; count: number }[]
  failedTxCount: number
}

export interface AnalysisParams {
  address: string
  chainIds: number[]
  startTs: number // 期間開始 (unix sec, UTC)
  endTs: number // 期間終了 (unix sec, UTC)
}

export interface AnalysisResult {
  params: AnalysisParams
  actions: DecodedAction[] // 新しい順
  portfolio: PortfolioResult
  summary: AnalysisSummary
  warnings: string[]
}

export type ProgressFn = (step: string, detail?: string) => void
