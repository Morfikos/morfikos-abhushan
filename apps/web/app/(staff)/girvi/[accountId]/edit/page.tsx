import { GirviCreateForm } from "@/features/girvi/girvi-create-form";

export default async function EditGirviDraftPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <GirviCreateForm accountId={accountId} />;
}
