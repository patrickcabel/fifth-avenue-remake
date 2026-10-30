# Local backups and recovery

The backend creates a snapshot at startup if the newest regular backup is at
least an hour old, then checks once per minute for the next hourly snapshot.
Use Backups → Back up now in the signed-in dashboard for an immediate copy.
The latest 168 regular snapshots and 10 pre-restore safety copies are retained.

Snapshots include saved requests (orders, reservations, decision history), staff
account and employee-code PIN hashes, menu availability, pickup state, and reservation rules.
Each included file is hashed and verified before a snapshot is accepted for restore.
Missing optional files represent the application's default state.
The source code, .env webhook secret, and active sign-in sessions are not included.

Docker stores these files in the project's backups folder on the host, separate
from the requests data volume. The backend must be running to make scheduled
copies. A stopped computer cannot make backups; startup catches up with one copy.
Snapshots remain on the same computer: copy the backups folder to private external
storage for protection against disk loss. These files contain customer information
and password hashes and must stay private. They are excluded from Git, Docker
build context, and HTTP file serving.

## Enable the updated Docker configuration

From the project folder in PowerShell:

    docker compose up --build -d service-desk

This adds the backup folder mount without deleting existing data.
Open the dashboard, sign in, select Backups, and verify a recent snapshot.

## Inspect or verify copies

These commands do not restore or change live data:

    docker compose exec service-desk node work/backup-cli.cjs list
    docker compose exec service-desk node work/backup-cli.cjs verify BACKUP_FILENAME.json

Use an actual filename shown in the Backups panel. Do not use a filesystem path.

## Restore a snapshot

Restore replaces the current saved application data with the selected snapshot.
Book a maintenance window: stop the backend so it cannot write during recovery.
Choose and verify the snapshot before stopping the app.

    docker compose stop service-desk
    docker compose run --rm --no-deps service-desk node work/backup-cli.cjs restore BACKUP_FILENAME.json --confirm-restore
    docker compose up -d service-desk

The command checks snapshot format, allowed filenames and checksums before
touching data. It first creates a pre-restore safety copy of current saved data.
If writing fails it attempts to roll back to the original files; keep the backend
stopped if it reports an incomplete rollback.

Restoring returns the staff account and password to the selected snapshot's
state. A snapshot made before account creation requires first-account setup again.
All sessions reset at backend startup. .env and the webhook secret are unchanged.
The normal no-show sweep runs after startup, so overdue confirmed reservations
may immediately be auto-cancelled under the current 15-minute policy.

Do not remove the requests volume as part of normal backup or restore.
