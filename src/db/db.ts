import Dexie, { type Table } from 'dexie'
import type {
  TxRow,
  InternalTxRow,
  TokenTransferRow,
  TokenRow,
  ReceiptRow,
  PriceRow,
  FetchRangeRow,
} from '../core/types'

export interface SigRow {
  selector: string
  /** 4byteで推定した関数名。見つからなかった場合は '' (負キャッシュ) */
  name: string
}

// IndexedDB (Dexie)。SQLite設計(仕様v0.2 §7)のブラウザ版。
// 生値はTEXT(string)のまま保存し、計算時のみBigInt化する。
class WalletLensDB extends Dexie {
  txs!: Table<TxRow, string>
  internals!: Table<InternalTxRow, string>
  transfers!: Table<TokenTransferRow, string>
  tokens!: Table<TokenRow, string>
  receipts!: Table<ReceiptRow, string>
  prices!: Table<PriceRow, string>
  ranges!: Table<FetchRangeRow, string>
  sigs!: Table<SigRow, string>

  constructor() {
    super('wallet-lens')
    this.version(1).stores({
      txs: 'key, [chainId+wallet], [chainId+wallet+blockNumber]',
      internals: 'key, [chainId+wallet], [chainId+wallet+blockNumber]',
      transfers: 'key, [chainId+wallet], [chainId+wallet+blockNumber]',
      tokens: 'key, [chainId+wallet]',
      receipts: 'key',
      prices: 'key, priceKey',
      ranges: 'key',
    })
    this.version(2).stores({
      sigs: 'selector',
    })
  }
}

export const db = new WalletLensDB()

export interface ApiKeys {
  /** Etherscan V2(Ethereumの解析に必要) */
  etherscan: string
  /** Moralis(Base / Arbitrumの解析に必要) */
  moralis: string
}

const KEY_STORAGE: Record<keyof ApiKeys, string> = {
  etherscan: 'wallet-lens:etherscan-api-key',
  moralis: 'wallet-lens:moralis-api-key',
}

export function getApiKeys(): ApiKeys {
  return {
    etherscan: localStorage.getItem(KEY_STORAGE.etherscan) ?? '',
    moralis: localStorage.getItem(KEY_STORAGE.moralis) ?? '',
  }
}

export function setApiKeys(keys: ApiKeys) {
  localStorage.setItem(KEY_STORAGE.etherscan, keys.etherscan.trim())
  localStorage.setItem(KEY_STORAGE.moralis, keys.moralis.trim())
}
