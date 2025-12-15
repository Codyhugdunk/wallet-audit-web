// bot.js - WalletAudit Pro (Bilingual Edition)
// 启动：node bot.js

const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

// =================配置区=================
const BOT_TOKEN = '8592506734:AAEVerAS9RYNE8h4QVAebNK0GULXCRQ9zoE'; 
const CHANNEL_USERNAME = '@walletaudit'; 

// 你的本地代理端口 (Clash)
const PROXY_URL = 'http://127.0.0.1:7897'; 
const AUDIT_API_URL = 'https://www.walletaudit.me/api/report';

// 忽略 SSL 证书错误，确保本地代理能通
const agent = new HttpsProxyAgent(PROXY_URL);
agent.options = { rejectUnauthorized: false };
// =======================================

const bot = new Telegraf(BOT_TOKEN, { 
    telegram: { agent: agent } 
});

// --- 工具函数：金额转中文万/亿 ---
function formatMoney(value) {
  if (!value) return '$0';
  if (value > 100000000) return `$${(value / 100000000).toFixed(2)}亿`;
  if (value > 10000) return `$${(value / 10000).toFixed(2)}万`;
  return `$${Math.round(value).toLocaleString()}`;
}

// --- 核心逻辑 ---

bot.start((ctx) => {
  ctx.replyWithHTML(
    `⚡️ <b>WalletAudit Terminal Online</b>\n\n` +
    `我是您的链上审计助手。请发送 <b>以太坊地址 (0x...)</b>\n` +
    `I am your on-chain audit assistant. Send an <b>ETH Address</b>.\n\n` +
    `👇 <i>Try typing an address now / 请输入地址:</i>`
  );
});

bot.on('text', async (ctx) => {
  const txt = (ctx.message.text || '').trim();
  const match = txt.match(/0x[a-fA-F0-9]{40}/);

  if (!match) return; // 不是地址不回复

  const address = match[0];
  const loadingMsg = await ctx.reply('⏳ Analyzing on-chain data...\n正在进行链上审计...');

  try {
    console.log(`正在查询: ${address}`);
    
    const res = await fetch(`${AUDIT_API_URL}?address=${address}`, { 
        agent: agent,
        timeout: 30000 
    });

    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    if (!data || data.error) throw new Error(data.error);

    // --- 数据组装 ---
    
    // 1. 风险表情
    const score = data.risk.score;
    const riskEmoji = score >= 80 ? '🟢' : score <= 50 ? '🔴' : '🟡';
    const riskText = score >= 80 ? 'Safe (安全)' : score <= 50 ? 'High Risk (高危)' : 'Medium (中等)';

    // 2. 资产数据
    const totalVal = formatMoney(data.assets.totalValue);
    const ethAmount = data.assets.eth.amount.toFixed(2);
    
    // 3. 授权风险
    const riskCount = data.approvals ? data.approvals.riskCount : 0;
    const approvalStatus = riskCount > 0 ? `🚫 ${riskCount} Risky Items` : `✅ Clean`;

    // 4. 交易活跃
    const txCount = data.activity.txCount;

    // --- 双语报表 (MarkdownV2 格式) ---
    // 注意：MarkdownV2 特殊字符需要转义，这里用简单的 HTML 模式更稳
    const msg = 
      `⚡️ <b>WalletAudit Intelligence</b>\n` +
      `<code>${data.address}</code>\n\n` +

      `💰 <b>Net Worth (总资产):</b> ${totalVal}\n` +
      `🛡 <b>Risk Score (评分):</b> ${score}/100 ${riskEmoji}\n` +
      `🏷 <b>Persona (画像):</b> ${data.risk.personaType}\n\n` +
      
      `📂 <b>Portfolio / 资产结构:</b>\n` +
      `• ETH: ${ethAmount} \n` +
      `• Tokens: ${data.assets.tokens.length} assets\n\n` +

      `⚠️ <b>Security Check / 安全检测:</b>\n` +
      `• Approvals (授权): ${approvalStatus}\n` +
      `• Activity (活跃度): ${txCount} txs\n\n` +

      `👉 <a href="https://www.walletaudit.me?address=${address}"><b>Tap to View Full Report</b></a>\n` +
      `点击查看完整图表与资金流向`;

    // 发送结果
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    
    // 发送带按钮的消息
    await ctx.replyWithHTML(msg, {
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
            [Markup.button.url('🚀 Open Full Report (打开完整报告)', `https://www.walletaudit.me?address=${address}`)],
            [Markup.button.url('📡 Subscribe Channel (关注频道)', `https://t.me/${CHANNEL_USERNAME.replace('@','')}`)]
        ])
    });

    console.log(`✅ 发送成功`);

  } catch (err) {
    console.error('❌ 报错:', err.message);
    ctx.telegram.editMessageText(
      ctx.chat.id, 
      loadingMsg.message_id, 
      undefined, 
      '❌ <b>Scan Failed / 查询失败</b>\nPlease try again later.\n请稍后再试。',
      { parse_mode: 'HTML' }
    );
  }
});

// 启动
bot.launch().then(() => {
    console.log('🤖 Bot is running...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));