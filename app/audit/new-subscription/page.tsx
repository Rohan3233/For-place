import { createClient } from "@/lib/supabase/server";
import NewSubscriptionAuditForm from "./NewSubscriptionAuditForm";

export default async function NewSubscriptionAuditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, plan")
    .eq("user_id", user?.id ?? "")
    .eq("status", "active");

  return <NewSubscriptionAuditForm subscriptions={subscriptions ?? []} />;
}