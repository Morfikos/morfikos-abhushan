import { ArticleDetail } from "@/features/inventory/article-detail";

export default async function ArticleDetailPage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  return <ArticleDetail articleId={articleId} />;
}
