# Fifth Avenue Sushi

Restaurant website plus a local pickup/reservation service desk.

## Try the dashboard

For Docker Desktop, stop npm run dev if port 3000 is in use, then run:

    docker compose up --build -d

The dashboard uses the same localhost URL below. Frontend files are mounted
read-only for live changes; restart the container after backend changes with
docker compose restart service-desk.

Docker stores requests in a named volume, separately from existing host demo
data. Host records are not imported automatically. docker compose down keeps
the volume; adding -v deletes it. View status with docker compose ps.
The container runs as a non-root user and exposes its port only on localhost.

Alternatively, run without Docker:

Run npm run dev, then open http://localhost:3000/dashboard.html.
The preview automatically reloads when HTML, CSS, JavaScript, or SVG files change.
No dependency installation is required.

The dashboard includes simulated phone orders and reservations, queue filters,
search, a user-enabled chime, adjustable pickup estimates, acceptance,
reservation confirmation, declines with required reasons, and completed order
history. Requests now persist on the local server and synchronize between tabs
through a server event stream. Browser audio requires pressing Enable chime.
Previous browser-only demo data is not imported.

Orders are pickup-only. Staff set the preparation estimate before acceptance;
the dashboard records a pickup time in Calgary time. Orders progress through
pending → accepted → ready for pickup → collected (completed in storage).
Legacy demo delivery orders are excluded. Delivery remains with Skip and Uber
Eats; this dashboard does not import or manage their orders.

This is a local development system with staff sign-in and Vapi tool integration.
Use fictional customer information while testing. It has no production database,
payments, customer SMS,
driver dispatch, capacity checks, or guaranteed background alerts. The original
reservation form and external ordering links are unchanged.

## Local server

Vapi reservation tools are available for account-side setup:
get_reservation_context, submit_reservation_request, get_reservation_status.
Submission always starts pending, uses exact future Calgary dates/times, and
deduplicates by call ID separately from pickup orders. Staff decisions appear in
callback lookups by reservation name and phone. Multiple matches require selection.
Table capacity and service hours are not automatically checked.

The dashboard arrival graph shows confirmed reservation guests by hour for a
selected Calgary calendar date, with pending requests shown separately.
It updates with the shared request stream. This is arrival demand, not live
occupancy: walk-ins, pickup orders, and assumed dining durations are not counted.
Older demo reservations without calendar dates are excluded and noted.

Staff can add a phone reservation from New reservation in All requests or
Reservations. The form collects customer name, callback phone, future Calgary
date/time, party size (1–30), and notes. Save pending for review or choose Confirmed
by staff after checking availability. Confirmed bookings are saved atomically
with a staff decision event; no automatic capacity check or customer SMS is sent.

Vapi callers can check a prior order by supplying the customer name and original
callback phone number to get_current_order_status. Both must match. Phone
formatting is normalized, including optional +1 for North American numbers.
The tool returns a status summary, not customer contact details. Same-call
lookups still work without parameters; paused pickup does not block lookups.
No reference is required from the caller. Names ignore case and repeated spaces.
Active orders are preferred over history. Multiple matches require selection by
placement date/time; the agent passes the selected candidate's orderId along with
the same name and phone. Name-only and phone-only lookups are not provided.

Staff can pause/resume new pickup orders without interrupting existing orders
or reservations. The setting persists across restarts in pickup-settings.json.
GET /api/pickup-status reports service state; PATCH takes paused and revision.
GET /api/requests/:id provides the latest restaurant decision for local testing.
Intake supports optional requestKey for safe retries: the same key and details
return the original record; reusing a key with changed details returns 409.
The order form reuses its key for unchanged retries after a connection failure.
These endpoints prepare for a future phone adapter; they are not public webhooks.

Menu availability is managed from the dashboard header. Sold-out items remain
visible in staff pickup menus with a label and disabled Add button. They are
excluded from the available-items API and rejected on submission, including stale drafts.
Existing orders keep their saved item names/prices and can finish normally.
Availability persists until staff restores it, including after container restarts.
Overrides are stored beside requests in menu-availability.json in the data volume.
GET /api/staff/menu includes sold-out items; PATCH /api/staff/menu/:id takes
revision and available (boolean), rejecting conflicting changes from another tab.
These staff endpoints require a signed-in session. The app still needs production
hosting, HTTPS, database backups, and account-management planning before launch.

Records are saved atomically in work/data/requests.json, excluded from Git and
blocked from HTTP downloads. The server binds to loopback and supports one
process on one computer. It is not ready for public hosting.

The dashboard starts empty; use Simulate incoming request to populate it.
Staff decisions check record revisions, rejecting stale actions from other tabs.
Each request keeps a decision event history. Controls disable while saving or
disconnected. Reconnecting refreshes the queue from the server.

GET /api/requests lists records. POST /api/requests creates demo requests.
PATCH /api/requests/:id takes revision and action (time, accept, ready, complete,
decline), plus minutes for time or reason for decline.
GET /api/events provides change notifications.

Pickup orders now use menu IDs, quantities, and optional item notes. Names and
prices are resolved on the server from menu-data.json, ignoring submitted prices.
GET /api/menu returns the available pickup menu. The New pickup order form lets
staff search dishes, build an order, enter customer details, and submit for review.
The catalog was extracted from the website; restaurant approval of prices and
pickup eligibility is still required. Alcohol is excluded. Required dish choices
are currently entered as item requests for staff review, not validated modifiers.
Subtotal excludes tax; payments and customer notifications are not connected.
Do not expose the API publicly. Restart npm run dev after server code changes.
Run npm test to verify validation, pickup transitions, conflict protection,
disk persistence, event history, and reservation confirmation.

## Next implementation milestone

Vapi pickup integration scaffolding is now included. Follow
integrations/vapi/SETUP.md for the Docker test tunnel, webhook credential,
assistant prompt, tool templates, and verification steps.
Only the dedicated authenticated tool listener (3002) should be forwarded.
The staff dashboard must stay local. Live Vapi calls require account setup;
no phone number, assistant, or paid call has been created automatically.

1. Move from local JSON storage to a production database with orders, order items,
   reservations, menu items, and an append-only decision/event log.
2. Add authenticated request creation and decision APIs. Validate menu item IDs,
   prices, quantities, service hours, and booking capacity on the
   server. Use integer cents and restaurant-local dates in America/Edmonton.
3. Connect the dashboard to a live event stream. Fetch missed events after
   reconnect; persist before notifying; deduplicate provider retries and prevent
   simultaneous staff decisions with transactional status transitions.
4. Connect a phone provider and voice agent. Read back customer details before
   submitting. Treat submissions as pending until a staff decision. Transfer
   uncertain or unsupported requests to staff.
5. Send customer confirmations after committed decisions using an outbox with
   retries. Keep requested and confirmed times separately. Do not report a
   customer as notified until delivery status is known.
6. Test with the restaurant before routing real calls. Decide pickup
   payment collection, reservation capacity rules, and unattended-request handling.

Source baseline: GitHub main commit 894374040029fb462b557beff32d56b395e20e21.
This workspace was populated through the GitHub connector; it is not a Git checkout.

## Staff reservation management

Pending and confirmed reservations can be edited or cancelled from their cards.
Confirmed bookings can be marked arrived or no-show; no-show is blocked before
the scheduled Calgary time. Cancellation requires a reason. Edits retain the
existing confirmation state and record before/after details with revision checks.
Arrived, cancelled, and no-show bookings move to History. Arrived guests remain
in the arrival graph; cancelled and no-show bookings are excluded. Phone status
lookups report these outcomes, but the agent still cannot change a booking.
No customer messages are sent automatically.

## Staff sign-in

## Reservation rules

Reservation settings starts with 40 tables total and 10 protected for walk-ins,
leaving 30 bookable tables. Bookings use two-hour intervals; staff can assign
multiple tables to a party. Capacity uses peak simultaneous confirmed/arrived
table counts, not summed guest arrivals. Pending requests do not hold capacity.
Confirmation and confirmed-booking edits recheck capacity and configured hours.
Phone requests use one provisional table and require staff review of allocation.

Default reservation service hours are Mon–Fri 11:00–21:00 and Sat–Sun 12:00–21:00,
matching https://www.fifthavenuesushi.ca/location-hours/ (checked October 30, 2026).
With two-hour bookings, the latest start is 19:00. Staff can set a
same-day window or mark a day closed. The full two-hour booking must fit inside
the window. Existing bookings are flagged rather than cancelled when rules change.
No overnight windows or individual table layouts are implemented.

Confirmed reservations not marked arrived are automatically cancelled after
15 minutes, with a saved cancellation reason and event in History. The server
checks every 30 seconds, on dashboard reads and Vapi tools, and on startup after
downtime. It must be running for timely cancellation; no customer message is sent.
Staff must mark guests arrived promptly. Arrived bookings are never auto-cancelled.
This is a planning allocation; it does not automatically check guests out.

Staff APIs: GET/PATCH /api/reservation-rules, POST /api/reservation-check.
Vapi: check_reservation_slot (date, time, guests) returns a provisional slot check.
Existing get_reservation_context exposes the two-hour and 15-minute policies.

## Staff account setup

After deploying this update with docker compose up --build -d service-desk, open
/dashboard.html. On first visit, create a username and password (12+ characters).
One local staff account is supported. Passwords are stored as salted scrypt hashes
in staff-account.json alongside the requests in the persistent data volume.
Existing orders and reservations are preserved. No default password is created.

Staff APIs require a session cookie (HttpOnly, SameSite=Strict). Sessions expire
after 12 hours or a backend restart. Sign out revokes the session. Login attempts
are limited after repeated failures. The health endpoint is /api/health and does
not return customer data. Docker health checks use this endpoint.

The Vapi listener on port 3002 continues using its separate bearer token; no Vapi
configuration changes are needed. Keep port 3000 local. Use HTTPS and a complete
account recovery/management design before deploying remotely.

## Dashboard update transport

Dashboard components share a single short polling loop through authenticated
/api/updates (every 2 seconds when visible, 10 seconds in the background). It
notifies components only when data changes and reloads frontend source changes.
This replaces multiple persistent browser EventSource connections, which could
exhaust localhost HTTP connections and leave settings requests queued. Close
old dashboard tabs and reopen after deploying this change.

Default-hour migration fills previously unconfigured days once, preserving custom
hours and closed days. Use Use restaurant hours, then Save settings, to reset all
seven days. Table counts, walk-in allowances and existing bookings are preserved.

## Automatic backups

Hourly local snapshots are written to the host backups folder, outside the
Docker data volume. The latest 168 regular copies are retained; Backups in the
staff dashboard shows status and supports Back up now. Snapshots include saved
requests, settings and staff account hashes, not .env or source code.
See BACKUPS.md for setup, verification and offline restore commands. A restore
takes a safety copy first. Copy the folder to private external storage to protect
against loss of this computer; local snapshots alone do not cover disk failure.

## Incoming request alerts

Chime is on by default, with waiting-request reminders every 30 seconds.
A staff mute preference is remembered in this browser and synchronized across tabs.
When the browser blocks autoplay, the first click or key press in the dashboard
unlocks audio; a separate Enable chime action is not needed unless it was muted. Pending
requests remain visible in a banner and browser-tab count; acceptance/decline
stops reminders when no requests remain. Snooze pauses alerts for five minutes
and is shared between tabs in the same browser. Browser notifications are opt-in
and contain no customer contact details. Alerts pause while disconnected.
Keep the dashboard open during service: background browser throttling, a sleeping
computer, or closing the page can prevent sound/notifications. This is not a
server-side push service.

## Employee codes and PINs

Staff sign in with an assigned four-digit employee code and three-digit PIN.
Leading zeros are preserved. A new installation creates its first manager code
on the sign-in screen. Existing managers can choose Use previous manager login,
then open Staff accounts to create employee codes without losing current access.
Managers can add staff/managers, reset PINs, and activate/deactivate accounts.
PIN resets and deactivation invalidate that employee’s active sessions. Repeated
failed numeric sign-ins are limited by employee code and device address. PINs are
stored as salted hashes in staff-codes.json, covered by backups. Staff account
management APIs require a manager session; regular service-desk access remains
available to staff. Request create/change events record the signed-in employee.

## Recover manager access locally

If previous credentials are unavailable, stop the backend, then run the interactive
recovery tool from PowerShell in the project folder:

    docker compose stop service-desk
    docker compose run --rm --no-deps service-desk node work/recover-manager.cjs
    docker compose up -d service-desk

Choose a manager name, four-digit code, and three-digit PIN privately. PIN entry
is hidden and confirmed. An existing manager code can be reset; a staff code
will not be silently promoted. The tool creates a safety backup before changing
manager access and preserves existing credentials, orders, reservations and settings.
There is no public password-reset endpoint.
