// app/api/debug/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const alchemyKey = process.env.ALCHEMY_RPC_URL;
  const etherscanKey = process.env.ETHERSCAN_API_KEY;

  // 1. 测试 Alchemy (查 V神余额)
  let alchemyTest = "Skipped";
  try {
    if (alchemyKey) {
        const res = await fetch(alchemyKey, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                method: "eth_getBalance",
                params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"], 
            }),
        });
        const data = await res.json();
        alchemyTest = data.result ? "✅ OK" : `❌ Error: ${JSON.stringify(data)}`;
    }
  } catch (e: any) {
    alchemyTest = `❌ Network Error: ${e.message}`;
  }

  // 2. 测试 Etherscan (查 V神最新一笔交易)
  let etherscanTest = "Skipped";
  try {
      if (etherscanKey) {
          // 使用 V2 接口
          const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&startblock=0&endblock=99999999&page=1&offset=1&sort=desc&apikey=${etherscanKey}`;
          const res = await fetch(url);
          const data = await res.json();
          
          if (data.status === "1") {
              etherscanTest = "✅ OK (Connected)";
          } else {
              etherscanTest = `❌ API Error: ${data.message} - ${data.result}`;
          }
      }
  } catch (e: any) {
      etherscanTest = `❌ Network Error: ${e.message}`;
  }

  return NextResponse.json({
    status: "System Diagnostic",
    keys_configured: {
        alchemy: !!alchemyKey,
        etherscan: !!etherscanKey
    },
    connectivity: {
        alchemy: alchemyTest,
        etherscan: etherscanTest
    }
  });
}