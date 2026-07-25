import type { Metadata } from "next";
import "./globals.css";
import logoMark from "./assets/logo-mark.png";

export const metadata: Metadata = {
  title: "品诺筑家整装",
  description: "嘉峪关一站式全屋整装设计与落地服务",
  icons: {
    icon: logoMark.src,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
