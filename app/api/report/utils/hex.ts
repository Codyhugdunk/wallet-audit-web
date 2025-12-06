// hex.ts — WalletAudit v1.0
// 所有链上数值转换工具

// 0x → bigint
export function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex) return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

// bigint → number（含最大安全范围保护）
export function bigIntToNumber(v: bigint, decimals = 18): number {
  if (v === 0n) return 0;
  try {
    const divisor = 10n ** BigInt(decimals);
    const val = Number(v / divisor) + Number(v % divisor) / Number(divisor);
    if (!Number.isFinite(val)) return 0;
    return val;
  } catch {
    return 0;
  }
}

// 类似 ethers.js formatUnits（轻量实现）
export function formatUnits(v: bigint, decimals = 18): number {
  return bigIntToNumber(v, decimals);
}

// 类似 ethers.js parseUnits（轻量实现）
export function parseUnits(v: string, decimals = 18): bigint {
  try {
    const [intPart, fracPart = ""] = v.split(".");
    const frac = fracPart.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac);
  } catch {
    return 0n;
  }
}

// 数值安全化（避免 NaN / Infinity）
export function safeFloat(n: any, fallback = 0): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return x;
}