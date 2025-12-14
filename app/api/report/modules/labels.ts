// app/api/report/modules/labels.ts

// 这是一个简化的标签获取函数，未来可以接入 Etherscan API 解析合约名
export async function getDisplayName(address: string): Promise<string> {
  // 暂时只做简单的截断返回，或者返回空字符串
  // 可以在这里扩展：查询数据库、查询 Uniswap Token List 等
  return ""; 
}