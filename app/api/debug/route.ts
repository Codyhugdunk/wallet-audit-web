// app/api/debug/route.ts
import { NextResponse } from "next/server";
import { getEthBalanceWithFallback } from "../../utils/rpc"; // 引用我们写的轮询工具

export const dynamic = "force-dynamic";

export async function GET() {
  const trumpAddress = "0x94845333028B1204Fbe14E1278Fd4Adde4660273";
  const startTime = Date.now();

  // 1. 测试 Alchemy 直连
  let alchemyResult = "Skipped";
  try {
      const res = await fetch(process.env.ALCHEMY_RPC_URL!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [trumpAddress, "latest"] }),
      });
      const json = await res.json();
      alchemyResult = json.result ? `✅ Success: ${json.result}` : `❌ Failed: ${JSON.stringify(json)}`;
  } catch (e: any) {
      alchemyResult = `❌ Error: ${e.message}`;
  }

  // 2. 测试我们的轮询工具 (rpc.ts)
  let fallbackResult = "Pending";
  try {
      const balance = await getEthBalanceWithFallback(trumpAddress);
      fallbackResult = `✅ Final Balance: ${balance}`;
  } catch (e: any) {
      fallbackResult = `❌ Fallback Error: ${e.message}`;
  }

  return NextResponse.json({
    target: "Trump Wallet",
    duration: `${Date.now() - startTime}ms`,
    alchemy_direct: alchemyResult,
    fallback_system: fallbackResult
  });
}