# Wallet Lens 拡張ロードマップ(2026-07-05)

> **進捗(2026-07-05)**: A-1〜A-5、B-1、C-1(Worker化)+バンドル分割を実装済み。
> 対応チェーンは8本(ETH / Base / Arbitrum / Optimism / Polygon / BNB / Avalanche / Linea)。
> zkSync EraはMoralisの対応状況を確認してから追加する(見送り)。
> 残タスク: B-2〜B-5、C-2以降、Phase D。

ゴール: **「チェーンを追加するだけで動く」構造を確立し、主要EVMチェーンを広くカバーする。**

現状の到達点: ETH(Etherscan)+ Base/Arbitrum(Moralis)のMVPが稼働。
アーキテクチャ上、チェーン追加は `src/config/chains.ts` への設定追加だけで済む形に
既になっているが、ネイティブ通貨・L1手数料・プロバイダ対応の前提がETH系3チェーンに
固定されている箇所を先に一般化する必要がある。

---

## Phase A: マルチチェーン基盤(最優先)

### A-1. プロバイダ戦略の一本化
- **全チェーンのデフォルトをMoralisにする**(EthereumもMoralis対応済み)。
  → 必須キーがMoralis 1個になり、セットアップが最も簡単になる
- Etherscanキーは「Ethereumの取得品質向上用(input/functionNameが確実)」の
  オプションに降格。設定されていればETHのみEtherscanを優先
- 効果: 新チェーン追加時にプロバイダの心配が不要になる(Moralis対応チェーンなら即対応)

### A-2. ネイティブ通貨の一般化
現在 `nativeSymbol: 'ETH'` / decimals 18 / 価格キー `coingecko:ethereum` が前提。
- ChainConfig の `nativePriceKey` / `nativeSymbol` は既に定義済みなので、
  POL/BNB/AVAX等でも動くことをコードレビューで確認(ハードコードされた 'ETH' 表記を排除)

### A-3. 追加チェーン第1弾(仕様v0.2 §2の拡張候補+主要どころ)
| チェーン | chainId | ネイティブ | wrapped | 注意点 |
|---|---|---|---|---|
| Optimism | 10 | ETH | WETH 0x4200...0006 | OP Stack: L1手数料あり(hasL1Fee) |
| Polygon PoS | 137 | POL | WPOL 0x0d50...1270 | 価格キー coingecko:polygon-ecosystem-token |
| BNB Chain | 56 | BNB | WBNB 0xbb4c...095c | 価格キー coingecko:binancecoin |
| Avalanche C | 43114 | AVAX | WAVAX 0xb31f...ab77 | 価格キー coingecko:avalanche-2 |
| Linea | 59144 | ETH | WETH 0xe5d7...698f | |
| zkSync Era | 324 | ETH | WETH 0x5aea...c91e | multicall3アドレス要確認 |

各チェーンの追加チェックリスト(→ A-4のドキュメント化):
1. viem/chains にチェーン定義があるか(multicall3含む)
2. Moralisのchainスラッグ
3. public RPC(CORS対応)2本
4. wrapped nativeアドレス
5. DefiLlamaのチェーンスラッグ+ネイティブ価格キー
6. エクスプローラURL(リンク用のみ。APIは不使用)
7. OP Stack系か(hasL1Fee)
8. seed.jsonにそのチェーンのnative bridge/主要CEXを数件追加

### A-4. チェーン追加手順書
`docs/adding-a-chain.md` として上記チェックリストを文書化。
理想形: 「PRで chains.ts に1エントリ+ラベル数件を足すだけ」

### A-5. UIのスケール対応
- チェーン選択をボタン列→折りたたみ可能なグリッドに(6〜10個対応)
- 「主要チェーン全選択」ボタン
- チェーンごとの取得進捗の並列表示(現在は逐次テキスト)

---

## Phase B: 解析品質の強化

### B-1. 「不明」分類の削減(Baseで顕在化)
- Moralisがinput/method_labelを返さないtxについて、RPCの
  `eth_getTransactionByHash` でinputを補完取得(既存のreceiptバッチ基盤を流用)
- methodIdから **4byte.directory** で関数名を推定(仕様v0.2 §4.1にあるが未実装)
- 効果: タイムラインの「不明」→「関数名つきコントラクト操作」に改善

### B-2. OP Stack系のL1手数料補正
- Base/Optimism等の送信txについてreceiptの `l1Fee` を取得し、
  ガス集計・残高巻き戻しに加算(警告バナーの根本解消)

### B-3. Swap/DEX対応の拡充
- 既存のUniV2/V3/V4・Curve・Balancerシグネチャで大半のフォークをカバー済み
  (PancakeSwap=V2互換、Aerodrome/Velodrome=V2系)
- 追加: Trader Joe(Avalanche)、Maverick、DODO等のイベントシグネチャ
- チェーン別の主要routerアドレスをprotocol名解決に利用

### B-4. 価格カバレッジ
- DefiLlamaで取れないトークンのCoinGeckoフォールバック
- ステーブルコインの$1近似フォールバック(USDT/USDC/DAI系のシンボル+既知アドレス)

### B-5. Bridge分類の本格化(マルチチェーンならでは)
- 同一解析内でチェーンAの出金とチェーンBの入金を時間×金額で突合し、
  「Arbitrum→Baseへ 0.5 ETH をブリッジ」という1行に統合表示
- labels/seed.jsonのbridge網羅度を拡充

---

## Phase C: 体験・運用の強化

- **解析エンジンのWeb Worker化**: 大規模アドレスでUIが固まるのを防止(スマホで重要)
- **バンドル分割**: 現在1.07MB単一chunk → recharts/viemを動的import化
- **Moralis CU消費の可視化**: 解析ごとの概算CU表示、無料枠残量の目安
- **キャッシュ管理UI**: IndexedDB使用量表示、アドレス単位のキャッシュ削除
- **解析履歴**: 過去に解析したアドレスのワンタップ再表示(キャッシュ済みなら即時)
- **複数アドレスのブックマーク**

---

## Phase D: 高度分析(仕様v0.2 Phase 3/4を維持)

- labels DB拡充、LP/Lending/Claimの本格分類、Counterparty分析
- 高頻度取引・BOT的挙動推定、推定損益、複数ウォレット比較
- Dune dex.tradesによる分類精度の事後検証

---

## 非対象(当面)

- **非EVMチェーン(Solana等)**: アドレス体系・データモデルが根本的に異なる。
  Moralis Solana APIはあるが、正規化層の全面改修が必要なため別プロジェクト規模
- CEX内部追跡、リアルタイム監視(仕様v0.2どおり)

## 推奨実施順

1. **A-1〜A-3**(Moralis一本化+6チェーン追加)— 効果が最大、リスク小
2. **B-1**(不明分類の削減)— 現在の見た目の品質に直結
3. **A-5 / C-1**(UIスケール+Worker化)— チェーン数が増えると必須
4. B-2以降は利用実感に応じて
