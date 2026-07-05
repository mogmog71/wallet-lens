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
  }
}

export const db = new WalletLensDB()

const API_KEY_STORAGE = 'wallet-lens:etherscan-api-key'

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? ''
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key.trim())
}
