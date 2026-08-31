#!/bin/sh
set -eu

# The image bootstrap account is used only here. Migrations and application traffic use
# separate least-privilege roles, so a leaked application URL cannot create or drop tables.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=migrator_password="$ZZJL_MIGRATOR_PASSWORD" \
  --set=app_password="$ZZJL_APP_PASSWORD" \
  --set=readonly_password="$ZZJL_READONLY_PASSWORD" <<'SQL'
CREATE ROLE zzjl_owner NOLOGIN;
CREATE ROLE zzjl_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE zzjl_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE zzjl_readonly LOGIN PASSWORD :'readonly_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT zzjl_owner TO zzjl_migrator;
ALTER DATABASE zzjl OWNER TO zzjl_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO zzjl_owner;
SQL
