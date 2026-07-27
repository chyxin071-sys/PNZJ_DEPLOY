import type { Metadata } from "next";
import "./globals.css";
import logoMark from "./assets/logo-mark.png";

export const metadata: Metadata = {
  title: "品诺筑家整装｜嘉峪关住宅设计与全案落地",
  description: "浏览品诺筑家真实小区住宅案例，了解从空间设计、施工、主材、定制到软装的一站式全案整装服务。",
  referrer: "no-referrer",
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
