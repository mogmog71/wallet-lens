import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  bsc,
  avalanche,
  linea,
} from 'viem/chains'
import type { Chain } from 'viem'

export interface ChainConfig {
  chainId: number
  key: string
  name: string
  shortName: string
  /**
   * 履歴取得はMoralis Wallet Historyを全チェーン共通のデフォルトとする。
   * etherscanFree=true のチェーンのみ、Etherscanキーが設定されていれば
   * Etherscan V2を優先する(input/functionNameの品質が高いため)。
   * ※2026年時点でEtherscan V2無料枠はEthereumのみ対応。
   */
  moralisChain: string
  etherscanFree?: boolean
  nativeSymbol: string
  /** DefiLlama の {chain}:{address} 形式のchainスラッグ */
  llamaChain: string
  /** ネイティブ通貨のDefiLlama価格キー */
  nativePriceKey: string
  /** wrapped native (WETH等) のアドレス(小文字)とシンボル */
  wrappedNative: string
  wrappedSymbol: string
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
    moralisChain: 'eth',
    etherscanFree: true,
    nativeSymbol: 'ETH',
    llamaChain: 'ethereum',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    wrappedSymbol: 'WETH',
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
    moralisChain: 'base',
    nativeSymbol: 'ETH',
    llamaChain: 'base',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    wrappedSymbol: 'WETH',
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
    moralisChain: 'arbitrum',
    nativeSymbol: 'ETH',
    llamaChain: 'arbitrum',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    wrappedSymbol: 'WETH',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
    explorerTx: 'https://arbiscan.io/tx/',
    explorerAddr: 'https://arbiscan.io/address/',
    viemChain: arbitrum,
    hasL1Fee: false,
  },
  {
    chainId: 10,
    key: 'optimism',
    name: 'Optimism',
    shortName: 'OP',
    moralisChain: 'optimism',
    nativeSymbol: 'ETH',
    llamaChain: 'optimism',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    wrappedSymbol: 'WETH',
    rpcUrls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
    explorerTx: 'https://optimistic.etherscan.io/tx/',
    explorerAddr: 'https://optimistic.etherscan.io/address/',
    viemChain: optimism,
    hasL1Fee: true,
  },
  {
    chainId: 137,
    key: 'polygon',
    name: 'Polygon',
    shortName: 'Poly',
    moralisChain: 'polygon',
    nativeSymbol: 'POL',
    llamaChain: 'polygon',
    nativePriceKey: 'coingecko:polygon-ecosystem-token',
    wrappedNative: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
    wrappedSymbol: 'WPOL',
    rpcUrls: ['https://polygon-rpc.com', 'https://polygon-bor-rpc.publicnode.com'],
    explorerTx: 'https://polygonscan.com/tx/',
    explorerAddr: 'https://polygonscan.com/address/',
    viemChain: polygon,
    hasL1Fee: false,
  },
  {
    chainId: 56,
    key: 'bsc',
    name: 'BNB Chain',
    shortName: 'BNB',
    moralisChain: 'bsc',
    nativeSymbol: 'BNB',
    llamaChain: 'bsc',
    nativePriceKey: 'coingecko:binancecoin',
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    wrappedSymbol: 'WBNB',
    rpcUrls: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
    explorerTx: 'https://bscscan.com/tx/',
    explorerAddr: 'https://bscscan.com/address/',
    viemChain: bsc,
    hasL1Fee: false,
  },
  {
    chainId: 43114,
    key: 'avalanche',
    name: 'Avalanche',
    shortName: 'AVAX',
    moralisChain: 'avalanche',
    nativeSymbol: 'AVAX',
    llamaChain: 'avax',
    nativePriceKey: 'coingecko:avalanche-2',
    wrappedNative: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
    wrappedSymbol: 'WAVAX',
    rpcUrls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-c-chain-rpc.publicnode.com',
    ],
    explorerTx: 'https://snowtrace.io/tx/',
    explorerAddr: 'https://snowtrace.io/address/',
    viemChain: avalanche,
    hasL1Fee: false,
  },
  {
    chainId: 59144,
    key: 'linea',
    name: 'Linea',
    shortName: 'Linea',
    moralisChain: 'linea',
    nativeSymbol: 'ETH',
    llamaChain: 'linea',
    nativePriceKey: 'coingecko:ethereum',
    wrappedNative: '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f',
    wrappedSymbol: 'WETH',
    rpcUrls: ['https://rpc.linea.build', 'https://linea-rpc.publicnode.com'],
    explorerTx: 'https://lineascan.build/tx/',
    explorerAddr: 'https://lineascan.build/address/',
    viemChain: linea,
    hasL1Fee: false,
  },
]

export function getChain(chainId: number): ChainConfig {
  const c = CHAINS.find((c) => c.chainId === chainId)
  if (!c) throw new Error(`unknown chainId: ${chainId}`)
  return c
}

/** このチェーンの解析にEtherscanプロバイダを使うか(キー設定時のみ) */
export function usesEtherscan(chain: ChainConfig, etherscanKey: string): boolean {
  return !!chain.etherscanFree && !!etherscanKey
}
