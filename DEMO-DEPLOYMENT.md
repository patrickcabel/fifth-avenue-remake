# Render demo

This deployment uses a free Docker web service. Local Docker data and credentials are not uploaded. Render's free filesystem resets on restart, redeploy and idle shutdown, including orders, settings, staff accounts and backups. Use fictional customer details only. A database or persistent disk is required before real use.

1. In Render choose **New → Blueprint**, connect `patrickcabel/fifth-avenue-remake`, and select branch `demo/first-build-2026-10-30`. Use the root `render.yaml`.
2. Confirm the service plan is **Free**. No database or paid disk is needed for this temporary demo.
3. Fill the prompted environment values:
   - `DEMO_PASSWORD`: a new shared demo password, 12–200 characters. Visitors enter this before staff sign-in.
   - `DEMO_MANAGER_CODE`: your chosen four digits (stored as text, preserving zeros).
   - `DEMO_MANAGER_PIN`: your chosen three digits.
   - `VAPI_WEBHOOK_SECRET`: a random shared token of at least 32 characters. This is not your Vapi API key. Use the same token in Vapi's bearer authorization credential.
4. Deploy. The manager account is recreated from those environment values whenever the temporary filesystem resets.
5. Open `https://YOUR-SERVICE.onrender.com/dashboard.html`, enter the demo password, then the manager code and PIN. Your previous local login is separate.
6. Change every connected Vapi tool's Server URL to `https://YOUR-SERVICE.onrender.com/vapi/tools`. Keep its function schema and attach the matching bearer credential. Publish the tools and assistant.
7. Place a fictional pickup order and reservation through Vapi. Confirm that both appear, chime, and return staff decisions on a callback. Test decline reasons too.

Before presenting, open the dashboard a few minutes early and leave it open. Free services sleep after 15 minutes without traffic and can take about a minute to wake. A sleeping instance can cause a Vapi tool timeout; wake it in the browser before calling. Changes pushed to this demo branch may redeploy and reset the demo.

Health check: `/api/health` should return `{"ok":true}`. If deployment fails, check Render logs for invalid manager credentials, a missing demo password, or a missing webhook secret. Never paste secrets into GitHub or chat.

Reference: https://render.com/docs/free
