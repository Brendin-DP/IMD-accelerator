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

  // Check if external reviewer already exists for this client and email
  const { data: existing, error: checkError } = await supabase
    .from("external_reviewers")
    .select("*")
    .eq("client_id", clientId)
    .eq("email", email)
    .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  // If exists, return the existing record
  if (existing) {
    return existing;
  }

  // If not exists, create a new external reviewer record
  const { data: newRecord, error: insertError } = await supabase
    .from("external_reviewers")
    .insert({
      client_id: clientId,
      email,
      invited_by: participantId,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return newRecord;
}