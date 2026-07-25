import type { Metadata } from "next";
import { AdminApp } from "../AdminApp";

export const metadata: Metadata = {
  title: "品诺筑家整装管理后台",
  description: "案例、客户线索与品牌内容管理",
};

export default function StudioAdminPage() {
  return <AdminApp />;
}
