import type { Metadata } from "next"

import { PageFicheArticle } from "@/components/modules/gmao/stock/fiche-article"

export const metadata: Metadata = { title: "Matériel roulant · Article" }

export default async function ArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params
  return <PageFicheArticle articleId={articleId} />
}
