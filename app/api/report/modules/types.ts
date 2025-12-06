// Schema A 全局类型定义（WalletAudit v1.0 + v1.1 人格标签）

export interface IdentityInfo {
  address: string;
  isContract: boolean;
  createdAt: number | null; // 时间戳
}

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  amount: number;
  value: number;
  decimals: number;
  hasPrice: boolean;
}

export interface AssetModule {
  eth: {
    amount: number;
    value: number;
  };
  tokens: TokenBalance[];
  totalValue: number;
  allocation: {
    category: string;
    value: number;
    ratio: number;
  }[];
  otherTokens: TokenBalance[];
  priceWarning: string | null;
}

export interface ActivityModule {
  txCount: number;
  activeDays: number;
  contractsInteracted: number;
  topContracts: string[];
  weeklyHistogram: { weekStart: number; count: number }[];
}

export interface GasModule {
  txCount: number;
  totalGasEth: number;
  totalGasUsd: number;
  topTxs: { hash: string; gasEth: number }[];
}

export interface RiskModule {
  level: string;
  score: number;
  comment: string;
  stableRatio: number;
  memeRatio: number;
  otherRatio: number;
  txCount: number;

  // v1.1 钱包人格标签系统
  personaType: string;      // 例如：稳健型持仓 / 高波动型持仓 / 休眠型地址 等
  personaTags: string[];    // 一组标签：["稳定币占比较高", "几乎无 Meme 仓位", ...]
}

export interface SummaryModule {
  text: string;
}

export interface ShareModule {
  shortAddr: string;
  ethAmount: number;
  ethPrice: number;
  totalValue: number;
  valueChange: number | null;
  valueChangePct: number | null;
  timestamp: number;
}

export interface ReportMeta {
  version: string;
  generatedAt: number;
  fromCache: boolean;
  history: { timestamp: number; totalValue: number }[];
  previousValue: number | null;
  valueChange: number | null;
  valueChangePct: number | null;
}

export interface FullReport {
  version: string;
  address: string;

  identity: IdentityInfo;
  summary: SummaryModule;

  assets: AssetModule;
  activity: ActivityModule;
  gas: GasModule;
  risk: RiskModule;
  share: ShareModule;

  meta: ReportMeta;
}