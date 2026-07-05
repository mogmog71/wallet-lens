# チェーン追加手順

新しいEVMチェーンへの対応は、原則 `src/config/chains.ts` に1エントリ追加するだけで完了する。

## 前提条件

- **Moralisが対応しているチェーンであること**(必須)。
  対応チェーン一覧: https://docs.moralis.com/supported-chains
- viem/chains にチェーン定義があること(multicall3アドレス込み)。
  なければ `defineChain` で自前定義する

## チェックリスト

`ChainConfig` の各フィールドを埋める:

| フィールド | 調べ方 |
|---|---|
| `chainId` | https://chainlist.org |
| `moralisChain` | Moralisのチェーンスラッグ(例: 'eth', 'polygon', 'bsc') |
| `nativeSymbol` | ネイティブ通貨(ETH/POL/BNB/AVAX等)。decimalsは18前提 |
| `llamaChain` | DefiLlamaのスラッグ。`https://coins.llama.fi/prices/current/{slug}:{token}` で照会が通るか確認(例: Avalancheは 'avax') |
| `nativePriceKey` | DefiLlamaのネイティブ価格キー(例: 'coingecko:binancecoin') |
| `wrappedNative` / `wrappedSymbol` | 公式のwrapped nativeコントラクト(小文字で記載) |
| `rpcUrls` | CORS対応のpublic RPCを2本(publicnode.com系 + 公式)。ブラウザから `eth_blockNumber` が通るか確認 |
| `explorerTx` / `explorerAddr` | ブロックエクスプローラのURL(リンク表示のみ。APIは使わない) |
| `viemChain` | `viem/chains` からimport |
| `hasL1Fee` | OP Stack系(Base/Optimism等)は true(L1手数料が残高計算に乗らない旨の警告表示) |
| `etherscanFree` | Etherscan V2無料枠で取得できる場合のみ true(2026年時点でEthereumのみ) |

## 追加で推奨する作業

1. `src/data/seedLabels.ts` にそのチェーンのnative bridge・主要CEXホットウォレットを
   2〜5件追加(確度の高い公知アドレスのみ。誤ラベルより未ラベルの方が害が小さい)
2. チェーン固有の主要DEXがUniswap V2/V3・Curve・Balancer系フォークでない場合、
   `src/config/signatures.ts` にSwapイベントシグネチャを追加
3. 実アドレスで解析を実行し、以下を確認:
   - 履歴が取得できる(Moralisスラッグが正しい)
   - 現在残高が取れる(RPC/multicall3が正しい)
   - ネイティブ価格が表示される(nativePriceKeyが正しい)

## 非対応のもの

- 非EVMチェーン(Solana等): アドレス体系・データモデルが異なるため対象外
- ネイティブdecimalsが18でないEVM互換チェーン: 現状未対応(要改修)
