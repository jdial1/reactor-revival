import { StorageUtils } from "../../utils/util.js";

export function getAuthenticatedUserId() {
  if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
    const googleUserId = window.googleDriveSave.getUserId();
    if (googleUserId) return `google_${googleUserId}`;
  }
  if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
    const supabaseUserId = window.supabaseAuth.getUserId();
    if (supabaseUserId) return `supabase_${supabaseUserId}`;
  }
  let existingUserId = StorageUtils.get("reactor_user_id");
  if (!existingUserId) {
    existingUserId = crypto.randomUUID();
    StorageUtils.set("reactor_user_id", existingUserId);
  }
  return existingUserId;
}
