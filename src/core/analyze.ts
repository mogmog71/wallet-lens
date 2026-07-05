import { getChain } from '../config/chains'
import { db, type ApiKeys } from '../db/db'
import { fetchCurrentPrices, fetchDailyPrices } from '../lib/defillama'
import { rawToNumber, utcDate } from '../lib/format'
import { lookupSelectors } from '../lib/fourbyte'
import { enrichTxInputs, fetchCurrentBalances, fetchReceipts } from '../lib/rpc'
import { classifyTx, groupByHash, isSwapCandidate } from './classify'
import { ensureRawData, loadRawData } from './fetcher'
import { mergeChains, reconstructChain, type ChainReconstruction } from './portfolio'
import { evaluateSpamTokens } from './spam'
import type {
  AnalysisParams,
  AnalysisResult,
  AnalysisSummary,
  DecodedAction,
  PortfolioResult,
  ProgressFn,
  TokenRow,
} from './types'

export async function runAnalysis(
  params: AnalysisParams,
  keys: ApiKeys,
  onProgress: ProgressFn,
): Promise<AnalysisResult> {
  const wallet = params.address.toLowerCase()
  const warnings: string[] = []
  const allActions: DecodedAction[] = []
  const reconstructions: ChainReconstruction[] = []
  const nowTs = Math.floor(Date.now() / 1000)

  for (const chainId of params.chainIds) {
    const chain = getChain(chainId)
    onProgress(`${chain.name}: データ取得`, 'Etherscanから履歴を取得しています')

    // 1. raw data(逆算方式のため期間開始〜最新まで常に取得する)
    await ensureRawData(chain, wallet, params.startTs, keys, (s, d) =>
      onProgress(`${chain.name}: ${s}`, d),
    )
    const raw = await loadRawData(chainId, wallet, params.startTs)
    const groups = groupByHash(raw)
    if (groups.length === 0) {
      reconstructions.push({ chainId, daily: [], tokens: [] })
      continue
    }

    // 1.5 「不明」削減(B-1): プロバイダがinputを返さなかった送信txをRPCで補完し、
    //     関数名が無いメソッドセレクタは4byte.directoryで推定する
    const enrichTargets = groups
      .filter(
        (g) =>
          g.tx &&
          g.tx.from === wallet &&
          !g.tx.inputChecked &&
          g.tx.input === '0x' &&
          (g.transfers.length > 0 || g.internals.length > 0 || g.tx.value === '0'),
      )
      .map((g) => g.tx!)
    if (enrichTargets.length > 0) {
      onProgress(`${chain.name}: メソッド情報を補完`, `${enrichTargets.length} 件`)
      await enrichTxInputs(chainId, enrichTargets, (done, total) =>
        onProgress(`${chain.name}: メソッド情報を補完`, `${done}/${total}`),
      )
    }
    const unnamedSelectors = [
      ...new Set(
        groups
          .filter(
            (g) =>
              g.tx && !g.tx.functionName && g.tx.methodId.length === 10 && g.tx.input !== '0x',
          )
          .map((g) => g.tx!.methodId),
      ),
    ]
    const sigNames =
      unnamedSelectors.length > 0 ? await lookupSelectors(unnamedSelectors) : undefined

    // 2. トークン現在価格(スパム判定の材料にもなる)
    onProgress(`${chain.name}: 価格取得`, '現在価格を照会しています')
    const erc20Addrs = [
      ...new Set(raw.transfers.filter((t) => t.standard === 'erc20').map((t) => t.tokenAddress)),
    ]
    const priceKeys = erc20Addrs.map((a) => `${chain.llamaChain}:${a}`)
    priceKeys.push(chain.nativePriceKey)
    const currentPrices = await fetchCurrentPrices(priceKeys)
    const priceAvailable = new Set(
      erc20Addrs.filter((a) => currentPrices.has(`${chain.llamaChain}:${a}`)),
    )

    // 3. スパム判定(仕様v0.3 §4)
    const tokenRows = evaluateSpamTokens(chainId, wallet, raw, priceAvailable, chain.wrappedNative)
    await db.tokens.bulkPut(tokenRows)
    const tokensMap = new Map<string, TokenRow>(tokenRows.map((t) => [t.tokenAddress, t]))
    const spamSet = new Set(tokenRows.filter((t) => t.isSpam).map((t) => t.tokenAddress))

    // 4. Swap候補txのreceipt取得(Event Log判定・方法A)
    const candidates = groups.filter((g) => isSwapCandidate(g, wallet)).map((g) => g.hash)
    onProgress(`${chain.name}: Swap判定`, `候補 ${candidates.length} 件のreceiptを取得`)
    const receipts = await fetchReceipts(chainId, candidates, (done, total) =>
      onProgress(`${chain.name}: Swap判定`, `receipt ${done}/${total}`),
    )

    // 5. 分類
    onProgress(`${chain.name}: 分類中`, `${groups.length} txを分類しています`)
    const actions = groups.map((g) =>
      classifyTx(g, wallet, chain, receipts.get(g.hash), tokensMap, sigNames),
    )

    // 6. 現在残高(multicall)
    onProgress(`${chain.name}: 残高取得`, 'multicallで現在残高を取得')
    const nonSpamTokens = erc20Addrs.filter((a) => !spamSet.has(a))
    let currentNative = 0n
    let currentTokens = new Map<string, bigint>()
    try {
      const bal = await fetchCurrentBalances(chainId, wallet as `0x${string}`, nonSpamTokens)
      currentNative = bal.native
      currentTokens = bal.tokens
    } catch {
      warnings.push(`${chain.name}: RPCから現在残高を取得できませんでした。資産推移は不正確です。`)
    }

    // 7. 日次過去価格(非スパムのみ)
    onProgress(`${chain.name}: 価格履歴`, '日次価格を取得しています')
    const histKeys = nonSpamTokens
      .filter((a) => priceAvailable.has(a))
      .map((a) => `${chain.llamaChain}:${a}`)
    histKeys.push(chain.nativePriceKey)
    const dailyPrices = await fetchDailyPrices(histKeys, params.startTs, nowTs)

    // 8. 逆算方式の資産推移
    onProgress(`${chain.name}: 資産推移を計算`)
    const tokenMeta = new Map<string, { symbol: string; decimals: number }>()
    for (const t of tokenRows) tokenMeta.set(t.tokenAddress, { symbol: t.symbol, decimals: t.decimals })
    const rec = reconstructChain({
      chain,
      wallet,
      raw,
      currentNative,
      currentTokens,
      spamTokens: spamSet,
      tokenMeta,
      dailyPrices,
      currentPrices,
      startTs: params.startTs,
    })
    reconstructions.push(rec)
    if (chain.hasL1Fee && raw.txs.some((t) => t.from === wallet)) {
      warnings.push(
        `${chain.name}: L1データ手数料は残高計算に含まれないため、ETH推移がわずかにずれる場合があります。`,
      )
    }

    // 9. アクションのUSD換算(日次価格・仕様v0.2 §8.2: 日次粒度で十分)
    for (const a of actions) {
      const date = utcDate(a.timeStamp)
      const priceOf = (tokenAddress: string): number | undefined => {
        const pk = tokenAddress === 'native' ? chain.nativePriceKey : `${chain.llamaChain}:${tokenAddress}`
        return dailyPrices.get(`${pk}:${date}`) ?? currentPrices.get(pk)
      }
      const usdOf = (assets: typeof a.assetsIn): number | undefined => {
        let sum = 0
        let any = false
        for (const asset of assets) {
          if (asset.standard !== 'native' && asset.standard !== 'erc20') continue
          const p = priceOf(asset.tokenAddress)
          if (p === undefined) continue
          sum += rawToNumber(asset.amountRaw, asset.decimals) * p
          any = true
        }
        return any ? sum : undefined
      }
      a.amountUsd = usdOf(a.assetsOut) ?? usdOf(a.assetsIn)
      const nativePrice = priceOf('native')
      if (nativePrice !== undefined && a.gasFeeNative !== '0') {
        a.gasFeeUsd = rawToNumber(a.gasFeeNative, 18) * nativePrice
      }
    }
    allActions.push(...actions)
  }

  // 期間でフィルタ(取得は最新まで行うが、表示・集計は指定期間)
  const inPeriod = allActions.filter(
    (a) => a.timeStamp >= params.startTs && a.timeStamp <= params.endTs,
  )
  inPeriod.sort((a, b) => b.timeStamp - a.timeStamp)

  const portfolio = buildPortfolio(reconstructions, inPeriod, params, nowTs)
  const summary = buildSummary(wallet, params, inPeriod)

  return { params, actions: inPeriod, portfolio, summary, warnings }
}

function buildPortfolio(
  recs: ChainReconstruction[],
  actions: DecodedAction[],
  params: AnalysisParams,
  nowTs: number,
): PortfolioResult {
  const daily = mergeChains(recs)
  const tokens = recs.flatMap((r) => r.tokens)
  const valued = tokens.filter((t) => t.priced).length
  const currentTotalUsd = tokens.reduce((s, t) => s + (t.currentUsd ?? 0), 0)

  const startDate = utcDate(params.startTs)
  const endDate = utcDate(Math.min(params.endTs, nowTs))
  const periodStartUsd = daily.find((d) => d.date === startDate)?.totalUsd
  const periodEndUsd = daily.find((d) => d.date === endDate)?.totalUsd

  // 外部入出金(transfer/bridge)のUSD合計。スパムのみのアクションは除外
  let externalInUsd = 0
  let externalOutUsd = 0
  for (const a of actions) {
    if (a.involvesSpamOnly || a.amountUsd === undefined) continue
    if (a.actionType === 'transfer_in') externalInUsd += a.amountUsd
    if (a.actionType === 'transfer_out') externalOutUsd += a.amountUsd
    if (a.actionType === 'bridge') {
      if (a.assetsIn.length > 0 && a.assetsOut.length === 0) externalInUsd += a.amountUsd
      if (a.assetsOut.length > 0 && a.assetsIn.length === 0) externalOutUsd += a.amountUsd
    }
  }

  const estimatedChangeUsd =
    periodStartUsd !== undefined && periodEndUsd !== undefined
      ? periodEndUsd - periodStartUsd - externalInUsd + externalOutUsd
      : undefined

  return {
    daily: daily.filter((d) => d.date >= startDate && d.date <= endDate),
    tokens,
    coverage: { valued, total: tokens.length },
    currentTotalUsd,
    periodStartUsd,
    periodEndUsd,
    externalInUsd,
    externalOutUsd,
    estimatedChangeUsd,
  }
}

function buildSummary(
  wallet: string,
  params: AnalysisParams,
  actions: DecodedAction[],
): AnalysisSummary {
  const gasByChain: Record<number, bigint> = {}
  let gasFeeUsd = 0
  const tokenCount = new Map<string, number>()
  const protocolCount = new Map<string, number>()
  const cex = new Set<string>()
  let swapCount = 0
  let approveCount = 0
  let bridgeCount = 0
  let hasDeployment = false
  let failedTxCount = 0

  for (const a of actions) {
    gasByChain[a.chainId] = (gasByChain[a.chainId] ?? 0n) + BigInt(a.gasFeeNative)
    gasFeeUsd += a.gasFeeUsd ?? 0
    if (a.status === 'failed') failedTxCount++
    if (a.actionType === 'swap') swapCount++
    if (a.actionType === 'approve') approveCount++
    if (a.actionType === 'bridge') bridgeCount++
    if (a.actionType === 'deployment') hasDeployment = true
    if (a.counterpartyLabel && (a.actionType === 'transfer_in' || a.actionType === 'transfer_out')) {
      cex.add(a.counterpartyLabel)
    }
    if (a.protocolName) protocolCount.set(a.protocolName, (protocolCount.get(a.protocolName) ?? 0) + 1)
    if (!a.involvesSpamOnly) {
      for (const asset of [...a.assetsIn, ...a.assetsOut]) {
        if (asset.standard === 'erc20' && !asset.isSpam) {
          tokenCount.set(asset.symbol, (tokenCount.get(asset.symbol) ?? 0) + 1)
        }
      }
    }
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

  return {
    address: wallet,
    chains: params.chainIds,
    firstSeen: actions.length > 0 ? actions[actions.length - 1].timeStamp : undefined,
    lastSeen: actions.length > 0 ? actions[0].timeStamp : undefined,
    txCount: actions.length,
    gasFeeUsd,
    gasFeeNativeByChain: Object.fromEntries(
      Object.entries(gasByChain).map(([k, v]) => [k, v.toString()]),
    ),
    swapCount,
    approveCount,
    bridgeCount,
    hasDeployment,
    cexActivity: [...cex],
    topTokens: top(tokenCount, 5).map(([symbol, count]) => ({ symbol, count })),
    topProtocols: top(protocolCount, 5).map(([name, count]) => ({ name, count })),
    failedTxCount,
  }
}
