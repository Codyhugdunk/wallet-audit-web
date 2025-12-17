// app/api/debug/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const alchemyKey = process.env.ALCHEMY_RPC_URL;
  const etherscanKey = process.env.ETHERSCAN_API_KEY;

  // 1. 检查 Key 是否存在 (只检查长度，不显示明文，安全第一)
  const envCheck = {
    alchemy: {
      exists: !!alchemyKey,
      length: alchemyKey?.length || 0,
      startsWithHttps: alchemyKey?.startsWith("https://"),
      // 检查是否包含空格
      hasWhitespace: /\s/.test(alchemyKey || ""), 
    },
    etherscan: {
      exists: !!etherscanKey,
      length: etherscanKey?.length || 0,
      hasWhitespace: /\s/.test(etherscanKey || ""),
    }
  };

  // 2. 尝试真的去请求一次 Alchemy (查 V 神的 ETH 余额)
  let alchemyTest = "Not Attempted";
  try {
    if (alchemyKey) {
        const res = await fetch(alchemyKey, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                method: "eth_getBalance",
                params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"], // V神地址
            }),
        });
        const data = await res.json();
        alchemyTest = data.result ? "✅ Success (Connected)" : `❌ Failed: ${JSON.stringify(data)}`;
    }
  } catch (e: any) {
    alchemyTest = `❌ Network Error: ${e.message}`;
  }

  return NextResponse.json({
    status: "Diagnostic Report",
    environment: envCheck,
    connectivity: {
        alchemy: alchemyTest
    }
  });
}