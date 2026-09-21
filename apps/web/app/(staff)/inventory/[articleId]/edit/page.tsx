import { EditArticleForm } from "@/features/inventory/edit-article-form";

export default async function EditArticlePage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  return <EditArticleForm articleId={articleId} />;
}
