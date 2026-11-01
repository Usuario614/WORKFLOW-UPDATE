# Activate WorkflowProof free accounts

The app remains local-first: the n8n workflow JSON is analyzed in the browser and is never sent to Supabase. The resulting audit report is saved to the signed-in user's account so it can be downloaded later. Reports may contain workflow/node names and findings; tell users this in your privacy notice.

## 1. Create a Supabase project
1. Create a project at https://supabase.com/.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run the complete contents of `supabase/schema.sql`.
4. In **Project Settings -> API**, copy the Project URL and the publishable/anon key. Never use the `service_role` key in a browser app.

## 2. Configure Render
In the Render Static Site dashboard, open **Environment** (or Environment Variables) and add:

- `VITE_SUPABASE_URL` = your Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key

Save changes and trigger a new deploy. Vite embeds `VITE_` values at build time, so changing them requires a rebuild.

## 3. Configure email authentication
In Supabase **Authentication -> URL Configuration**, add your deployed site URL to the allowed redirect URLs, for example:

`https://workflowproof-up.onrender.com/**`

For a frictionless first test, email confirmation can be disabled in **Authentication -> Providers -> Email**. If confirmation remains enabled, users must confirm their email before signing in.

## 4. Test
1. Register with a test email and password (minimum 8 characters).
2. Confirm the profile shows 2 free scans.
3. Upload a valid n8n workflow JSON; the counter should change to 1.
4. Upload a second workflow; the counter should change to 0.
5. A third scan must be rejected, including if the user opens another browser tab.
6. Sign out and sign back in; the remaining credit and report history should persist.

## Data and security notes
- `profiles` and `scan_reports` have Row Level Security enabled.
- Credit decrement is performed by an atomic database function, not a browser-only counter.
- The browser uses only the Supabase publishable/anon key. Never add the service-role key to Render's `VITE_` variables.
- The workflow JSON is not uploaded. The audit report JSON is saved in `scan_reports` and may include node names and issue details.
- This is the free-account foundation. Premium checkout, paid credit top-ups, password reset UI, account deletion UI and rate limiting are not included yet.
