import { PublicCaseDetail } from "../../PublicSite";
import { findPublicCase } from "../../public-data";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicCaseDetail item={findPublicCase(id)} />;
}
