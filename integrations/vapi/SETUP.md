# Connect Vapi for a test pickup call

The project includes a Vapi tool receiver. An assistant and real calls have not
been created in your Vapi account. No Vapi private API key is needed for the
dashboard-based setup below.

## 1. Prepare Docker (PowerShell in the project directory)

    node work/setup-vapi-secret.cjs
    docker compose --profile voice up --build -d
    docker compose logs vapi-tunnel

The secret script creates a random webhook token in the ignored .env file. It
does not print the token or replace an existing configured token.

Look for the HTTPS trycloudflare.com URL in the tunnel logs. Use that URL plus
/vapi/tools as your Vapi Function tool server URL.
The tunnel reaches only the dedicated tool server on port 3002; the staff
dashboard on port 3000 stays local. Do not forward port 3000.
Quick Tunnels are for development, may change URL on restart, and provide no
production availability guarantee.

## 2. Configure webhook authentication in Vapi

Create or sign in to your account at https://dashboard.vapi.ai.
Open the local .env file privately and copy the value of VAPI_WEBHOOK_SECRET.
Do not paste it into chat, commit it, or use your Vapi private API key here.

In Vapi: Integrations → Server Configuration → Add Custom Credential.
Select Bearer Token. Paste the webhook secret as the token, use Authorization
as the header name, and enable Include Bearer Prefix. Save the credential.

## 3. Create the assistant and Function tools

Create a pickup assistant in Vapi. Copy assistant-prompt.txt into its system
instructions. Start with a test greeting such as:
"Hi, I'm Fifth Avenue Sushi's automated assistant. This is a test pickup line.
What would you like to order?"

In Tools, create synchronous Function tools using tools.json as the
reference for each function name, description, and parameters schema.
For all tools, set server URL to your tunnel URL plus /vapi/tools and select
the Custom Credential created above. Attach the saved tools to the saved
assistant. Keep async off: the assistant must wait for saved results.

tools.json is a template array, not a ready-made assistant import. Replace URL
and credentialId placeholders if creating tools through the API.
Select a supported model and voice in Vapi's dashboard. Check their usage costs.

## 4. Test before adding a telephone number

Use the assistant's browser testing option if available in your Vapi dashboard.
This avoids buying a phone number for the initial test; Vapi/provider usage may
still consume credits. Keep tests short and check account billing limits.
Use fictional customer information only.

1. Enable dashboard chime, then ask for two miso soups.
2. Confirm a fictional name and callback number and approve the read-back.
3. Verify exactly one pending order appears, labeled Vapi phone agent.
4. Accept it with a pickup estimate. Ask the assistant for the current status.
5. Mark miso soup sold out and verify the agent stops offering it.
6. Pause pickup and verify a new test call cannot submit an order.

The backend deduplicates repeated submissions by Vapi call ID, even if tool
call IDs change. One order is supported per call; edits after submission and
post-submission changes are not connected. Callback status lookup is supported
using both the customer name and callback phone number. Update the
get_current_order_status schema from tools.json and save the assistant prompt.
No order reference is required from callers. Multiple matching orders require
clarification by placement date/time before selecting a returned orderId.
Only staff can accept/decline.
Reservation tools are get_reservation_context, submit_reservation_request,
get_reservation_status, and check_reservation_slot. Add reservation-prompt.txt to the assistant prompt
and remove older instructions saying reservations are unsupported.
Reservation requests remain pending until staff confirms. Capacity and configured
service hours are checked; each phone request provisionally uses one table until
staff allocates the correct number. Defaults are 40 total tables, 10 protected
for walk-ins, two-hour bookings, and 15-minute automatic no-show cancellation.
Hours remain unconfigured until staff enters them.
SMS, payment collection, and live human transfer are not
connected. The agent must explain these limits.

## Restart or stop

After backend edits: docker compose restart service-desk
After changing .env: docker compose --profile voice up -d
Stop the public tunnel: docker compose --profile voice stop vapi-tunnel
Stop the app and tunnel without removing data: docker compose --profile voice down

## Documentation

- https://docs.vapi.ai/tools/custom-tools
- https://docs.vapi.ai/server-url/server-authentication
- https://docs.vapi.ai/quickstart/web
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
