import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// 1. 加载字体
const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({ 
  subsets: ["latin"], 
  variable: "--font-mono",
  display: "swap",
});

// 2. 移动端与主题配置
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#050505", // 与网页背景一致的深黑色
};

// 3. 全局 SEO 配置
export const metadata: Metadata = {
  metadataBase: new URL("https://walletaudit.me"), // 你的正式域名
  title: {
    default: "WalletAudit | On-chain Intelligence Terminal",
    template: "%s | WalletAudit",
  },
  description: "Detect risk approvals, track smart money whales, and visualize on-chain portfolios. The definitive crypto security tool.",
  keywords: [
    "crypto audit", 
    "wallet tracker", 
    "risk check", 
    "etherscan alternative", 
    "whale tracking",
    "token approvals",
    "defi portfolio"
  ],
  authors: [{ name: "WalletAudit Team" }],
  
  // 社交媒体分享卡片 (Open Graph)
  openGraph: {
    title: "WalletAudit - 洞察巨鲸，追踪聪明钱",
    description: "一站式链上战绩分析、交易流追踪与风险审计终端。",
    url: "https://walletaudit.me",
    siteName: "WalletAudit",
    images: [
      {
        url: "/og-image.png", // 确保 public 文件夹里有这张图
        width: 1200,
        height: 630,
        alt: "WalletAudit Dashboard Interface",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  
  // 推特卡片
  twitter: {
    card: "summary_large_image",
    title: "WalletAudit | Crypto Risk & Intel Terminal",
    description: "Audit any wallet instantly. Check risk score, approvals, and PnL.",
    creator: "@WalletAudit", // 你的推特账号
    images: ["/og-image.png"],
  },
  
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png", // 可选：如果你有做苹果图标的话
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans bg-[#050505] text-slate-200 antialiased selection:bg-blue-500/30`}>
        {children}
        <Analytics /> {/* Vercel 流量统计 */}
      </body>
    </html>
  );
}