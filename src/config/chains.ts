import { mainnet, base, arbitrum } from 'viem/chains'
import type { Chain } from 'viem'

export interface ChainConfig {
  chainId: number
  key: 'ethereum' | 'base' | 'arbitrum'
  name: string
  shortName: string
  nativeSymbol: string
  /** DefiLlama の {chain}:{address} 形式のchainスラッグ */
  llamaChain: string
  /** ネイティブ通貨のDefiLlama価格キー */
  nativePriceKey: string
  /** wrapped native (WETH等) のアドレス(小文字) */
  wrappedNative: string
  rpcUrls: string[]
  explorerTx: string
  explorerAddr: string
  viemChain: Chain
  /** OP Stack系: L1データ手数料が gasUsed×gasPrice に含まれない(残高巻き戻しの既知誤差) */
  hasL1Fee: boolean
}

export const CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    key: 'ethereum',
    name: 'Ethereum',
    shortName: 'ETH',
    nativeSymbol: 'ETH',
    llamaChain: 'ethereum',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
    explorerTx: 'https://etherscan.io/tx/',
    explorerAddr: 'https://etherscan.io/address/',
    viemChain: mainnet,
    hasL1Fee: false,
  },
  {
    chainId: 8453,
    key: 'base',
    name: 'Base',
    shortName: 'Base',
    nativeSymbol: 'ETH',
    llamaChain: 'base',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    rpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
    explorerTx: 'https://basescan.org/tx/',
    explorerAddr: 'https://basescan.org/address/',
    viemChain: base,
    hasL1Fee: true,
  },
  {
    chainId: 42161,
    key: 'arbitrum',
    name: 'Arbitrum One',
    shortName: 'Arb',
    nativeSymbol: 'ETH',
    llamaChain: 'arbitrum',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
    explorerTx: 'https://arbiscan.io/tx/',
    explorerAddr: 'https://arbiscan.io/address/',
    viemChain: arbitrum,
    hasL1Fee: false,
  },
]

export function getChain(chainId: number): ChainConfig {
  const c = CHAINS.find((c) => c.chainId === chainId)
  if (!c) throw new Error(`unknown chainId: ${chainId}`)
  return c
}
