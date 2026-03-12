-- PostgreSQL Initialisierung für Containerplanung
CREATE DATABASE containerplanung;

CREATE USER containerplanung WITH PASSWORD 'ctpl11';
GRANT CONNECT ON DATABASE containerplanung TO containerplanung;

\c containerplanung

GRANT USAGE ON SCHEMA public TO containerplanung;
GRANT CREATE ON SCHEMA public TO containerplanung;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO containerplanung;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO containerplanung;
