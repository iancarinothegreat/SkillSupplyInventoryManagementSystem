# Canonical database migrations

This directory is the single authoritative migration location for the Supabase database.

The older `skillsupply/migrations` directory is retained as an archive of manually-run SQL. Do not execute both directories. Before applying any historical migration to an existing database, compare it with the live Supabase schema and apply only changes that are missing.

The current database schema was supplied from Supabase on 2026-09-25. The application is aligned with that schema by using `audit_log.audit_id` as the audit primary key.
