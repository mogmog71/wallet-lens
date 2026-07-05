import { getChain } from '../config/chains'
import { formatAmount, formatDateTime } from '../lib/format'
import type { DecodedAction } from './types'

const ACTION_LABELS: Record<string, string> = {
  deployment: 'コントラクト作成',
  wrap: 'ラップ',
  unwrap: 'アンラップ',
  approve: '利用許可',
  swap: 'スワップ',
  bridge: 'ブリッジ',
  claim: '請求',
  transfer_in: '受取',
  transfer_out: '送金',
  transfer_self: '自己送金',
  nft_transfer: 'NFT移動',
  unknown: '不明',
}

export function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** フィルタ適用後のタイムラインをCSV化する。UTF-8 BOM付き(Excel対応) */
export function exportCsv(actions: DecodedAction[]): Blob {
  const header = [
    '日時', 'チェーン', 'txハッシュ', '行動分類', 'プロトコル', '相手先', 'メソッド',
    '入った資産', '出た資産', 'USD換算', 'ガス代(ネイティブ)', 'ガス代(USD)',
    '成否', '説明', '確信度', '判定理由',
  ]
  const rows = actions.map((a) => {
    const chain = getChain(a.chainId)
    return [
      formatDateTime(a.timeStamp),
      chain.name,
      a.txHash,
      actionLabel(a.actionType),
      a.protocolName ?? '',
      a.counterpartyLabel ?? a.counterparty ?? '',
      a.methodName ?? '',
      a.assetsIn.map((x) => `${formatAmount(x.amountRaw, x.decimals)} ${x.symbol}`).join(' / '),
      a.assetsOut.map((x) => `${formatAmount(x.amountRaw, x.decimals)} ${x.symbol}`).join(' / '),
      a.amountUsd !== undefined ? a.amountUsd.toFixed(2) : '',
      a.gasFeeNative !== '0' ? formatAmount(a.gasFeeNative, 18, 8) : '',
      a.gasFeeUsd !== undefined ? a.gasFeeUsd.toFixed(4) : '',
      a.status === 'failed' ? '失敗' : '成功',
      a.summary,
      a.confidence,
      a.reason,
    ].map(csvEscape)
  })
  const body = [header, ...rows].map((r) => r.join(',')).join('\r\n')
  return new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
