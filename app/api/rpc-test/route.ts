import { NextRequest, NextResponse } from 'next/server';

// 简单 RPC 测试：直接对 ALCHEMY_RPC_URL 调用 eth_getBalance
export async function GET(req: NextRequest) {
  const address =
    req.nextUrl.searchParams.get('address') ??
    '0x28c6c06298d514db089934071355e5743bf21d60'; // 默认用那个 CEX 热钱包

  const rpcUrl = process.env.ALCHEMY_RPC_URL;

  if (!rpcUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: 'NO_ALCHEMY_RPC_URL',
        message: '环境变量 ALCHEMY_RPC_URL 未配置',
      },
      { status: 500 },
    );
  }

  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest'],
  };

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      // 不是 JSON 就算了，直接透传原始文本
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        // 尽量给你看原始返回
        raw: text,
        parsed,
      },
      { status: res.ok ? 200 : 500 },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: 'FETCH_FAILED',
        message: e?.message ?? String(e),
      },
      { status: 500 },
    );
  }
}