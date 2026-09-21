import { GirviCreateForm } from "@/features/girvi/girvi-create-form";

export default function EditGirviDraftPage({ params }: { params: { accountId: string } }) {
  return <GirviCreateForm accountId={params.accountId} />;
}
