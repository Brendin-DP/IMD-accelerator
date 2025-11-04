import { supabase } from "@/lib/supabaseClient";

/**
 * Validates domain and inserts an external reviewer
 */
export async function inviteExternalReviewer({
  email,
  subdomain,
  clientId,
  participantId,
}: {
  email: string;
  subdomain: string;
  clientId: string;
  participantId: string;
}) {
  const domain = email.split("@")[1];
  const allowedDomain = `${subdomain}.com`; // adjust if your real company domains differ

  if (!domain.endsWith(allowedDomain)) {
    throw new Error(`Only company emails (${allowedDomain}) are allowed`);
  }

  // Create or reuse the external reviewer record
  const { data, error } = await supabase
    .from("external_reviewers")
    .upsert(
      {
        client_id: clientId,
        email,
        invited_by: participantId,
      },
      { onConflict: "client_id,email" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}