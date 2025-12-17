// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WalletAudit - 链上资产审计与情报终端 (Crypto Portfolio & Risk Scanner)",
  description: "专业的以太坊钱包安全审计工具。一键检测高危授权、貔貅资产，追踪巨鲸(Whale)与聪明钱(Smart Money)动向。Free ETH/ERC20 Portfolio Tracker & Risk Analyzer.",
  keywords: [
    "Wallet Audit", "Crypto Security", "Token Approval Checker", "Revoke Cash",
    "Ethereum Portfolio", "Whale Tracker", "Smart Money", "链上审计", 
    "钱包安全", "取消授权", "孙宇晨", "Vitalik", "貔貅盘检测"
  ],
  openGraph: {
    title: "WalletAudit - 洞察巨鲸，追踪聪明钱",
    description: "30秒看穿钱包风险，追踪主力资金流向。",
    url: "https://walletaudit.me",
    siteName: "WalletAudit",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WalletAudit - On-chain Intelligence Terminal",
    description: "Track Whales. Audit Risks. Find Alpha.",
    creator: "@WalletAudit",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#050505] text-slate-200`}>
        {children}
      </body>
    </html>
  );
}