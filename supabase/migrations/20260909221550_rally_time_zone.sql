-- Preserve the organizer's IANA timezone separately from the UTC timestamp.
-- Existing rallies and older clients have no recoverable timezone; keep NULL.
ALTER TABLE public.rallies ADD COLUMN time_zone text;

CREATE OR REPLACE FUNCTION public.create_rally(p_payload jsonb, p_user_id uuid, p_invite_token text, p_creator_token text)
RETURNS public.rallies LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  rally public.rallies;
  candidates timestamptz[];
BEGIN
  IF p_invite_token !~ '^[a-z0-9]{16,64}$' OR p_creator_token !~ '^[a-z0-9]{16,64}$'
    OR p_invite_token IS NULL OR p_creator_token IS NULL THEN
    RAISE EXCEPTION 'Invalid Rally link.';
  END IF;
  rally.status := coalesce(p_payload->>'status', 'open');
  IF rally.status NOT IN ('draft', 'open') THEN RAISE EXCEPTION 'Invalid initial Rally status.'; END IF;
  rally.time_zone := nullif(p_payload->>'timeZone', '');
  IF rally.time_zone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = rally.time_zone
  ) THEN
    RAISE EXCEPTION 'Choose a valid timezone.';
  END IF;
  rally.activity := btrim(coalesce(p_payload->>'activity', ''));
  rally.time_mode := coalesce(p_payload->>'timeMode', 'specific');
  rally.starts_at := CASE WHEN rally.time_mode = 'specific' THEN (p_payload->>'startsAt')::timestamptz END;
  rally.location_mode := coalesce(p_payload->>'locationMode', 'specific');
  rally.location := CASE WHEN rally.location_mode = 'specific' THEN nullif(btrim(p_payload->>'location'), '') END;
  SELECT coalesce(array_agg(value::timestamptz), ARRAY[]::timestamptz[]) INTO candidates
    FROM jsonb_array_elements_text(coalesce(p_payload->'candidates', '[]'::jsonb));
  IF rally.time_mode <> 'poll' THEN candidates := ARRAY[]::timestamptz[]; END IF;
  PERFORM private.validate_rally_plan(rally, candidates, rally.status = 'open');
  INSERT INTO public.rallies (activity, time_mode, starts_at, location_mode, location,
    status, published_at, user_id, invite_token, creator_token, time_zone)
  VALUES (rally.activity, rally.time_mode, rally.starts_at, rally.location_mode, rally.location,
    rally.status, CASE WHEN rally.status = 'open' THEN statement_timestamp() END,
    p_user_id, p_invite_token, p_creator_token, rally.time_zone) RETURNING * INTO rally;
  INSERT INTO public.rally_candidates (rally_id, starts_at, position)
    SELECT rally.id, starts_at, position - 1 FROM unnest(candidates) WITH ORDINALITY AS c(starts_at, position);
  PERFORM public.refresh_rallies(NULL, rally.id);
  SELECT * INTO rally FROM public.rallies WHERE id = rally.id;
  RETURN rally;
END;
$$;

