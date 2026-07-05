import { toEventSelector } from 'viem'

// Swap判定(方法A)用の既知DEXイベント topic0。
// ハードコード定数ではなく viem でシグネチャ文字列から算出する(転記ミス防止)。
export const SWAP_EVENT_TOPICS: Record<string, string> = {
  [toEventSelector('Swap(address,uint256,uint256,uint256,uint256,address)')]:
    'Uniswap V2系DEX',
  [toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)')]:
    'Uniswap V3系DEX',
  [toEventSelector('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)')]:
    'Uniswap V4',
  [toEventSelector('TokenExchange(address,int128,uint256,int128,uint256)')]: 'Curve',
  [toEventSelector('TokenExchange(address,uint256,uint256,uint256,uint256)')]: 'Curve',
  [toEventSelector('Swap(bytes32,address,address,uint256,uint256)')]: 'Balancer V2',
}

export const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')
export const WETH_DEPOSIT_TOPIC = toEventSelector('Deposit(address,uint256)')
export const WETH_WITHDRAWAL_TOPIC = toEventSelector('Withdrawal(address,uint256)')

// メソッドセレクタ
export const SELECTORS = {
  approve: '0x095ea7b3',
  increaseAllowance: '0x39509351',
  decreaseAllowance: '0xa457c2d7',
  wethDeposit: '0xd0e30db0',
  wethWithdraw: '0x2e1a7d4d',
} as const

export const APPROVE_SELECTORS = new Set<string>([
  SELECTORS.approve,
  SELECTORS.increaseAllowance,
  SELECTORS.decreaseAllowance,
])

/** functionName にこれらが含まれたら Claim 系と推定(粗い判定・MVP) */
export const CLAIM_NAME_PATTERNS = ['claim', 'harvest', 'getreward', 'collect']
