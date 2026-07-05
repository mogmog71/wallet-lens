// Bridge / CEX の静的シードリスト(仕様 v0.2 §6.4)。
// 方針: 誤ラベルより未ラベルの方が害が小さい。確度の高い公知アドレスのみ登録する。
// アドレスはすべて小文字。chainId=0 は「全チェーン共通」を意味する。

export interface SeedLabel {
  address: string
  chainId: number // 0 = 全チェーン
  name: string
  category: 'cex' | 'bridge'
}

export const SEED_LABELS: SeedLabel[] = [
  // ---- CEX hot wallets (Ethereum mainnet, 公知) ----
  { address: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', chainId: 1, name: 'Binance', category: 'cex' },
  { address: '0xd551234ae421e3bcba99a0da6d736074f22192ff', chainId: 1, name: 'Binance 2', category: 'cex' },
  { address: '0x564286362092d8e7936f0549571a803b203aaced', chainId: 1, name: 'Binance 3', category: 'cex' },
  { address: '0x0681d8db095565fe8a346fa0277bffde9c0edbbf', chainId: 1, name: 'Binance 4', category: 'cex' },
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', chainId: 0, name: 'Binance 14', category: 'cex' },
  { address: '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', chainId: 0, name: 'Binance 16', category: 'cex' },
  { address: '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', chainId: 1, name: 'Coinbase 1', category: 'cex' },
  { address: '0x503828976d22510aad0201ac7ec88293211d23da', chainId: 1, name: 'Coinbase 2', category: 'cex' },
  { address: '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', chainId: 1, name: 'Coinbase 3', category: 'cex' },
  { address: '0x3cd751e6b0078be393132286c442345e5dc49699', chainId: 1, name: 'Coinbase 4', category: 'cex' },
  { address: '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43', chainId: 0, name: 'Coinbase 10', category: 'cex' },
  { address: '0x2910543af39aba0cd09dbb2d50200b3e800a63d2', chainId: 1, name: 'Kraken', category: 'cex' },
  { address: '0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13', chainId: 1, name: 'Kraken 4', category: 'cex' },
  { address: '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b', chainId: 1, name: 'OKX', category: 'cex' },
  { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', chainId: 0, name: 'Bybit', category: 'cex' },

  // ---- Bridges ----
  // Across SpokePool
  { address: '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5', chainId: 1, name: 'Across', category: 'bridge' },
  { address: '0x09aea4b2242abc8bb4bb78d537a67a245a7bec64', chainId: 8453, name: 'Across', category: 'bridge' },
  { address: '0xe35e9842fceaca96570b734083f4a58e8f7c5f2a', chainId: 42161, name: 'Across', category: 'bridge' },
  // Stargate
  { address: '0x8731d54e9d02c286767d56ac03e8037c07e01e98', chainId: 1, name: 'Stargate', category: 'bridge' },
  // Hop
  { address: '0xb8901acb165ed027e32754e0ffe830802919727f', chainId: 1, name: 'Hop (ETH)', category: 'bridge' },
  // Arbitrum native bridge (L1側)
  { address: '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', chainId: 1, name: 'Arbitrum Bridge (Inbox)', category: 'bridge' },
  { address: '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a', chainId: 1, name: 'Arbitrum Bridge', category: 'bridge' },
  // Base native bridge (L1側)
  { address: '0x49048044d57e1c92a77f79988d21fa8faf74e97e', chainId: 1, name: 'Base Portal', category: 'bridge' },
  { address: '0x3154cf16ccdb4c6d922629664174b904d80f2c35', chainId: 1, name: 'Base Bridge', category: 'bridge' },
  // OP Stack L2側 standard bridge (Base)
  { address: '0x4200000000000000000000000000000000000010', chainId: 8453, name: 'Base Bridge (L2)', category: 'bridge' },
  // LayerZero endpoint v1
  { address: '0x66a71dcef29a0ffbdbe3c6a460a3b5bc225cd675', chainId: 1, name: 'LayerZero Endpoint', category: 'bridge' },
]

/** (chainId, address) → ラベル。chainId=0(共通)は全チェーンで一致する */
export function findLabel(chainId: number, address: string | undefined | null): SeedLabel | undefined {
  if (!address) return undefined
  const a = address.toLowerCase()
  return SEED_LABELS.find((l) => l.address === a && (l.chainId === 0 || l.chainId === chainId))
}
