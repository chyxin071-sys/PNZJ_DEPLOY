import type { Metadata } from "next";
import "./globals.css";
import logoMark from "./assets/logo-mark.png";

export const metadata: Metadata = {
  title: "品诺筑家整装｜嘉峪关住宅设计与全案落地",
  description:
    "浏览品诺筑家真实住宅案例，了解从空间设计、施工、主材、定制到软装的一站式全案整装服务。品诺有心，筑家有道。",
  referrer: "no-referrer",
  icons: { icon: logoMark.src },
  openGraph: {
    title: "品诺筑家整装｜品诺有心，筑家有道",
    description: "真实住宅案例，全案设计与落地。",
    url: "https://pinnuozhujia.cn/",
    siteName: "品诺筑家整装",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "https://pinnuozhujia.cn/og.png", width: 1664, height: 936, alt: "品诺有心，筑家有道" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "品诺筑家整装｜品诺有心，筑家有道",
    description: "真实住宅案例，全案设计与落地。",
    images: ["https://pinnuozhujia.cn/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
