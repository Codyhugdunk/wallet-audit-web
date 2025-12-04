// bot.js
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ===== ① 填你的 Bot Token（摩洛哥账号这个） =====
const BOT_TOKEN = '8592506734:AAGAzLUw9bR2yc9JXK_p8MOFv15evnVG7do'; // ← 换成你的真实 Token

// ===== ② Telegram 代理（Clash 的 HTTP 端口）=====
const PROXY_URL = 'http://127.0.0.1:7897';
const tgAgent = new HttpsProxyAgent(PROXY_URL);

// ===== ③ 你的线上审计接口地址 =====
const AUDIT_API_URL =
  'https://walletaudit.me/api/report';

if (!BOT_TOKEN) {
  console.error('❌ 未配置 BOT_TOKEN');
  process.exit(1);
}

// 这里给 Telegraf 显式指定代理 agent
const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    agent: tgAgent,
  },
});

// 简单格式化数字
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '未知';
  const n = Number(num);
  if (Math.abs(n) >= 1_000_000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

// 调用审计接口，并打印完整调试信息（这部分走的是 Vercel，不需要代理）
async function callAuditApi(address) {
  const body = { address };

  console.log('==== 开始调用审计接口 ====');
  console.log('URL:', AUDIT_API_URL);
  console.log('address:', address);

  let resp;
  try {
    resp = await fetch(AUDIT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      agent: tgAgent,
    });
  } catch (e) {
    console.error('❌ fetch 调用失败（网络层面）:', e);
    throw new Error('网络错误：无法连接审计接口');
  }

  const status = resp.status;
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  console.log('HTTP 状态码:', status);
  console.log('Content-Type:', contentType);
  console.log('原始返回前 500 字符:\n', text.slice(0, 500));
  console.log('==== 审计接口返回结束 ====');

  if (!resp.ok) {
    throw new Error(`HTTP 非 2xx 状态码：${status}`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`返回 Content-Type 不是 JSON：${contentType || '空'}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('❌ JSON.parse 失败:', e);
    throw new Error('返回体不是合法 JSON 文本');
  }

  console.log('JSON 解析成功，顶层字段:', Object.keys(data));
  return data;
}

// /start 指令
bot.start(async (ctx) => {
  await ctx.reply(
    '👋 欢迎使用 *Wallet Audit Bot*\n\n' +
      '请直接发送你的 *ETH 钱包地址* （例如以 0x 开头），\n' +
      '我会帮你调用线上审计接口，生成一份简版审计摘要，并附上网页版完整报告链接。',
    { parse_mode: 'Markdown' },
  );
});

// 处理文本消息（钱包地址）
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // 过滤掉 / 开头的命令
  if (text.startsWith('/')) return;

  const address = text;

  // 简单校验：以 0x 开头且长度 42
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    await ctx.reply(
      '⚠️ 这看起来不像是一个合法的 ETH 地址。\n\n' +
        '请发送类似 `0x` 开头、40 位十六进制字符的地址。',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  await ctx.reply(
    '⏳ 已收到地址：\n`' +
      address +
      '`\n\n正在从链上获取数据并生成审计摘要，大约需要几秒钟……',
    { parse_mode: 'Markdown' },
  );

  try {
    const data = await callAuditApi(address);

    // -------- 宽松解析返回结构 + 构造多维度审计文案 --------
    const addr =
      data.address || data.normalizedAddress || data.walletAddress || address;

    function pickBestNumber(...candidates) {
      for (const c of candidates) {
        if (typeof c === 'number' && !Number.isNaN(c)) return c;
        if (typeof c === 'string' && c.trim() !== '' && !Number.isNaN(Number(c))) {
          return Number(c);
        }
      }
      return null;
    }

    // 1️⃣ 总资产（USD）
    const totalUsd = pickBestNumber(
      data.totalUsd,
      data.totalUsdValue,
      data.totalValueUsd,
      data.totalUsdEstimate,
      data.totalValue,
      data.summary && (data.summary.totalUsd || data.summary.totalValueUsd),
    );

    // 2️⃣ Gas / 交易次数
    const gasObj = (data.gasSummary || data.gas || {}) || {};
    const metaObj = data.meta || {};

    const gasTotalEth = pickBestNumber(
      gasObj.totalGasEth,
      gasObj.totalGas,
      gasObj.gasTotalEth,
    );

    const txCount = pickBestNumber(
      gasObj.txCount,
      gasObj.totalTxCount,
      metaObj.txCount,
      data.txCount,
      data.totalTxCount,
    );

    // 3️⃣ 资产构成（Top5 持仓 + 风险分布）
    const tokens =
      (Array.isArray(data.tokens) && data.tokens) ||
      (Array.isArray(data.holdings) && data.holdings) ||
      (Array.isArray(data.assets) && data.assets) ||
      (Array.isArray(data.portfolioTokens) && data.portfolioTokens) ||
      (Array.isArray(data.positions) && data.positions) ||
      [];

    function getTokenSymbol(t) {
      if (!t) return 'Unknown';
      return (
        t.symbol ||
        t.tokenSymbol ||
        t.ticker ||
        (t.token && (t.token.symbol || t.token.ticker)) ||
        'Unknown'
      );
    }

    function getTokenUsdValue(t) {
      if (!t) return 0;
      const v =
        t.usdValue ||
        t.usd ||
        t.valueUsd ||
        t.valueUSD ||
        t.value ||
        t.totalUsd ||
        t.totalValueUsd ||
        t.totalValue ||
        (t.summary && (t.summary.usdValue || t.summary.totalValue));
      if (typeof v === 'number') return v;
      if (v) {
        const n = Number(v);
        if (!isNaN(n)) return n;
      }
      return 0;
    }

    const sortedTokens = [...tokens].sort(
      (a, b) => getTokenUsdValue(b) - getTokenUsdValue(a),
    );
    const topTokens = sortedTokens.slice(0, 5);

    const stableSet = new Set([
      'USDT',
      'USDC',
      'DAI',
      'FDUSD',
      'TUSD',
      'BUSD',
      'USDe',
      'USDJ',
      'LUSD',
    ]);
    const blueChipSet = new Set([
      'ETH',
      'WETH',
      'WBTC',
      'BTC',
      'BTC.b',
      'ARB',
      'OP',
      'BNB',
      'SOL',
      'LINK',
      'UNI',
      'AAVE',
      'MKR',
      'LDO',
    ]);

    let stableUsd = 0;
    let bluechipUsd = 0;
    let othersUsd = 0;

    for (const t of tokens) {
      const sym = getTokenSymbol(t).toUpperCase();
      const v = getTokenUsdValue(t);
      if (!v || v <= 0) continue;
      if (stableSet.has(sym)) {
        stableUsd += v;
      } else if (blueChipSet.has(sym)) {
        bluechipUsd += v;
      } else {
        othersUsd += v;
      }
    }

    const totalForRisk =
      (totalUsd && totalUsd > 0 ? totalUsd : stableUsd + bluechipUsd + othersUsd) ||
      0;

    function pct(part, total) {
      if (!total || total <= 0 || !part) return '0.0%';
      return ((part / total) * 100).toFixed(1) + '%';
    }

    const stablePct = pct(stableUsd, totalForRisk);
    const bluechipPct = pct(bluechipUsd, totalForRisk);
    const othersPct = pct(othersUsd, totalForRisk);

    // 4️⃣ DEX / DeFi 使用情况（如果接口有的话就展示，没就略过）
    const dexSummary = data.dexSummary || data.defiSummary || null;
    const dexLines = [];
    if (dexSummary) {
      const dexCount =
        dexSummary.dexCount ||
        dexSummary.protocolCount ||
        dexSummary.distinctDexes ||
        null;
      const swapCount =
        dexSummary.swapCount ||
        dexSummary.tradeCount ||
        dexSummary.totalSwaps ||
        null;
      const topNames =
        dexSummary.topDexes ||
        dexSummary.topProtocols ||
        dexSummary.topNames ||
        [];

      dexLines.push('💱 *DeFi / DEX 使用概览：*');
      if (dexCount != null) {
        dexLines.push(`· 交互过的协议数量：${dexCount}`);
      }
      if (swapCount != null) {
        dexLines.push(`· 历史 Swap 笔数：${swapCount}`);
      }
      if (Array.isArray(topNames) && topNames.length > 0) {
        const names = topNames
          .slice(0, 5)
          .map((x) => (typeof x === 'string' ? x : x.name || x.id || '未知'))
          .join(', ');
        dexLines.push(`· 主要协议：${names}`);
      }
    }

    // 5️⃣ 构造总体风格的中文审计总结
    let riskComment = '';
    if (totalForRisk > 0) {
      const stableRatio = stableUsd / totalForRisk;
      const bluechipRatio = bluechipUsd / totalForRisk;
      const othersRatio = othersUsd / totalForRisk;

      if (stableRatio > 0.6) {
        riskComment += '整体偏稳健，以稳定币为主，适合防守型持仓。';
      } else if (othersRatio > 0.5) {
        riskComment += '整体偏进攻，高波动资产占比较高，短期回撤风险较大。';
      } else if (bluechipRatio > 0.5) {
        riskComment += '以主流蓝筹为核心配置，风险与收益相对均衡。';
      } else {
        riskComment += '资产分布较为分散，可视为中性偏稳的组合。';
      }

      if (gasTotalEth && gasTotalEth > 3) {
        riskComment +=
          ' 历史 Gas 支出较高，说明链上交互较频繁，注意控制频繁小额操作带来的成本。';
      } else if (gasTotalEth && gasTotalEth < 0.3 && txCount && txCount > 0) {
        riskComment +=
          ' 历史 Gas 支出较低，说明整体交互次数有限，属于低频用户。';
      }
    } else {
      riskComment =
        '暂未能识别完整的资产分布，仅能提供基础仓位与 Gas 视角的参考。';
    }

    const reportUrl =
      data.reportUrl ||
      data.fullReportUrl ||
      data.reportLink ||
      'https://walletaudit.me';

    const lines = [];
    lines.push('✅ *审计完成*');
    lines.push('');
    lines.push('📌 *地址：*');
    lines.push('`' + addr + '`');
    lines.push('');

    if (totalUsd !== null && !isNaN(totalUsd)) {
      lines.push(
        '💰 *预估总资产（USD）：* $' + formatNumber(totalUsd),
      );
    } else {
      lines.push(
        '💰 *预估总资产：* 暂无法解析（未在返回中找到清晰的总资产字段）',
      );
    }

    // Top5 持仓
    if (topTokens.length > 0) {
      lines.push('');
      lines.push('📦 *Top 5 持仓概览：*');
      topTokens.forEach((t, idx) => {
        const sym = getTokenSymbol(t);
        const v = getTokenUsdValue(t);
        lines.push(`${idx + 1}. ${sym} — $${formatNumber(v)}`);
      });
    }

    // 风险视图
    if (totalForRisk > 0) {
      lines.push('');
      lines.push('📊 *资产风险分布：*');
      lines.push(
        `· 稳定币：$${formatNumber(stableUsd)}（${stablePct}）`,
      );
      lines.push(
        `· 主流资产：$${formatNumber(bluechipUsd)}（${bluechipPct}）`,
      );
      lines.push(
        `· 其他高波动资产：$${formatNumber(othersUsd)}（${othersPct}）`,
      );
    }

    // Gas 体检
    lines.push('');
    lines.push('⛽ *Gas 体检：*');

    if (gasTotalEth !== null && !isNaN(gasTotalEth)) {
      lines.push(
        '· 累计 Gas 消耗（ETH）：' + formatNumber(gasTotalEth),
      );
    } else {
      lines.push('· 累计 Gas 消耗（ETH）：未知');
    }

    if (txCount !== null && !isNaN(txCount)) {
      lines.push('· 历史交易次数：' + txCount);
    } else {
      lines.push('· 历史交易次数：未知');
    }

    // DeFi / DEX 用法
    if (dexLines.length > 0) {
      lines.push('');
      dexLines.forEach((l) => lines.push(l));
    }

    // 审计总结
    lines.push('');
    lines.push('🧾 *审计总结：*');
    lines.push(riskComment);

    // 网页版报告
    lines.push('');
    lines.push('🌐 *网页版完整报告：*');
    lines.push(reportUrl + '?address=' + addr);

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('❌ 审计流程出错:', err);
    await ctx.reply(
      '❌ 审计接口调用失败，或返回数据格式异常。\n\n' +
        '你可以稍后重试，或者直接打开网页版：\n' +
        'https://walletaudit.me',
    );
  }
});

// 启动 bot
(async () => {
  console.log('Telegram bot 即将启动...');
  await bot.launch();
  console.log('Telegram bot 已启动，按 Ctrl+C 停止。');
})();

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));