-- Shared by all deployments. Callers cannot choose the limit or date.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE private.places_request_budget (
  day date PRIMARY KEY,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 150)
);
ALTER TABLE private.places_request_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.places_request_budget FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_places_request()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reserved integer;
BEGIN
  INSERT INTO private.places_request_budget AS budget (day, requests)
  VALUES ((statement_timestamp() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (day) DO UPDATE SET requests = budget.requests + 1
    WHERE budget.requests < 150
  RETURNING requests INTO reserved;
  RETURN reserved IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_places_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_places_request() TO service_role;
