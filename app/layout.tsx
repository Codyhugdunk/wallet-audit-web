import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // 1. 标题：加入最具搜索价值的词（查黑客、查貔貅）
  title: "WalletAudit - 链上资产审计与情报终端 | 查黑客 | 查巨鲸 | 查貔貅",
  
  // 2. 描述：增加 OneKey 和安全相关的描述
  description: "专业的以太坊/EVM钱包安全审计工具。一键检测高危授权、貔貅资产风险。追踪孙宇晨、V神等巨鲸(Whale)与聪明钱(Smart Money)实时动向。免费、安全、无需连接钱包。",
  
  // 3. 关键词：覆盖中文币圈热词
  keywords: [
    "钱包安全检测", "取消授权", "Revoke Cash", "查貔貅", 
    "孙宇晨钱包", "V神地址", "聪明钱追踪", "链上数据分析",
    "OneKey", "USDT风险", "以太坊浏览器", "Wallet Audit",
    "加密货币审计", "黑客追踪"
  ],
  
  // 4. 社交媒体分享卡片配置
  openGraph: {
    title: "WalletAudit - 你的链上私家侦探",
    description: "30秒看穿钱包风险，追踪主力资金流向。防被盗，跟巨鲸。",
    url: "https://walletaudit.me",
    siteName: "WalletAudit",
    locale: "zh_CN", // ✅ 改为中文
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WalletAudit - 链上资产审计终端",
    description: "洞察巨鲸，追踪聪明钱，检测授权风险。",
    creator: "@WalletAudit",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ✅ 关键修改：lang="zh" 告诉浏览器这是中文网站
    <html lang="zh">
      <body className={`${inter.className} bg-[#050505] text-slate-200`}>
        {children}
      </body>
    </html>
  );
}