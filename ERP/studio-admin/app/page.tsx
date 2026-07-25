import type { Metadata } from "next";
import { PublicSite } from "./PublicSite";

export const metadata: Metadata = {
  title: "品诺筑家整装｜嘉峪关一站式全屋整装",
  description: "品诺筑家整装，扎根嘉峪关二十余年，提供一站式全屋整装设计与落地服务。",
};

export default function Home() {
  return <PublicSite />;
}
