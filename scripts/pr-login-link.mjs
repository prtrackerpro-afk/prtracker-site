// DEV/TEST ONLY — generates a one-shot magic link via Supabase admin API.
// Bypasses the email service entirely (no SMTP rate limit).
//
// Usage:
//   node --env-file=.env scripts/pr-login-link.mjs felipeslaier@gmail.com
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env. Auto-creates
// the user (auto-confirmed) if they don't exist yet.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.PUBLIC_SITE_URL || "https://prtracker.com.br";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env scripts/pr-login-link.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Best-effort create + auto-confirm. If user exists, ignore the error.
const { error: createErr } = await supabase.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createErr && !/already|registered|exists/i.test(createErr.message)) {
  console.error("createUser error:", createErr.message);
}

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${siteUrl}/pr/auth/callback` },
});

if (error) {
  console.error("generateLink error:", error.message);
  process.exit(1);
}

console.log(`\nLogin link for ${email}:\n`);
console.log(data.properties.action_link);
console.log("\nClick once. Valid ~1h. Bypasses SMTP entirely.");
