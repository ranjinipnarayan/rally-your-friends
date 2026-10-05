-- Cancellation is retired; delete_rally is the supported removal action.
-- Keep legacy cancelled records readable and preserve existing RPC privileges.
CREATE OR REPLACE FUNCTION public.manage_rally(p_rally_id uuid, p_user_id uuid, p_creator_token text, p_patch jsonb)
RETURNS public.rallies LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  rally public.rallies;
  action text := coalesce(p_patch->>'action', 'save');
  candidates timestamptz[];
BEGIN
  SELECT * INTO rally FROM public.rallies WHERE id = p_rally_id FOR UPDATE;
  IF NOT FOUND OR (rally.user_id IS NOT NULL AND rally.user_id IS DISTINCT FROM p_user_id)
    OR (rally.user_id IS NULL AND rally.creator_token IS DISTINCT FROM p_creator_token) THEN
    RAISE EXCEPTION 'This Rally is not available to this account.';
  END IF;
  PERFORM public.refresh_rallies(NULL, rally.id);
  SELECT * INTO rally FROM public.rallies WHERE id = p_rally_id;
  IF action NOT IN ('save', 'publish', 'confirm', 'archive', 'unarchive') THEN
    RAISE EXCEPTION 'Invalid Rally action.';
  END IF;
  IF action IN ('archive', 'unarchive') THEN
    UPDATE public.rallies SET archived_at = CASE WHEN action = 'archive' THEN statement_timestamp() END
      WHERE id = rally.id RETURNING * INTO rally;
    RETURN rally;
  END IF;
  IF rally.status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'This Rally is already closed. Its final plan cannot be changed.';
  END IF;
  IF action = 'publish' AND rally.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be published.'; END IF;
  IF action = 'confirm' AND rally.status <> 'open' THEN RAISE EXCEPTION 'Publish this draft before confirming.'; END IF;
  IF rally.status <> 'draft' AND p_patch ?| ARRAY['activity', 'timeMode', 'startsAt', 'locationMode', 'location', 'candidates'] THEN
    RAISE EXCEPTION 'Only drafts can change their original questions. Choose the final time and location instead.';
  END IF;
  SELECT coalesce(array_agg(starts_at ORDER BY position), ARRAY[]::timestamptz[]) INTO candidates
    FROM public.rally_candidates WHERE rally_id = rally.id;
  IF rally.status = 'draft' THEN
    IF p_patch ? 'activity' THEN rally.activity := btrim(coalesce(p_patch->>'activity', '')); END IF;
    IF p_patch ? 'timeMode' THEN rally.time_mode := p_patch->>'timeMode'; END IF;
    IF p_patch ? 'startsAt' THEN rally.starts_at := (p_patch->>'startsAt')::timestamptz; END IF;
    IF p_patch ? 'locationMode' THEN rally.location_mode := p_patch->>'locationMode'; END IF;
    IF p_patch ? 'location' THEN rally.location := nullif(btrim(p_patch->>'location'), ''); END IF;
    IF p_patch ? 'candidates' THEN
      SELECT coalesce(array_agg(value::timestamptz), ARRAY[]::timestamptz[]) INTO candidates
        FROM jsonb_array_elements_text(p_patch->'candidates');
    END IF;
    IF rally.time_mode <> 'specific' THEN rally.starts_at := NULL; END IF;
    IF rally.time_mode <> 'poll' THEN candidates := ARRAY[]::timestamptz[]; END IF;
    IF rally.location_mode <> 'specific' THEN rally.location := NULL; END IF;
    PERFORM private.validate_rally_plan(rally, candidates, action = 'publish');
    DELETE FROM public.rally_candidates WHERE rally_id = rally.id;
    INSERT INTO public.rally_candidates (rally_id, starts_at, position)
      SELECT rally.id, starts_at, position - 1 FROM unnest(candidates) WITH ORDINALITY AS c(starts_at, position);
  END IF;
  IF p_patch ? 'finalTime' THEN rally.final_time := (p_patch->>'finalTime')::timestamptz; END IF;
  IF p_patch ? 'finalLocation' THEN rally.final_location := nullif(btrim(p_patch->>'finalLocation'), ''); END IF;
  IF char_length(rally.final_location) > 200 THEN RAISE EXCEPTION 'The location is too long.'; END IF;
  IF rally.final_time IS NOT NULL AND (NOT isfinite(rally.final_time) OR rally.final_time <= statement_timestamp()) THEN
    RAISE EXCEPTION 'Choose a future final time.';
  END IF;
  IF action = 'publish' THEN
    rally.status := 'open';
    rally.published_at := statement_timestamp();
    rally.expires_at := statement_timestamp() + interval '30 days';
  ELSIF action = 'confirm' THEN
    rally.final_time := coalesce(rally.final_time, rally.starts_at);
    rally.final_location := nullif(btrim(coalesce(rally.final_location, rally.location)), '');
    IF rally.final_time IS NULL OR NOT isfinite(rally.final_time) OR rally.final_time <= statement_timestamp() THEN
      RAISE EXCEPTION 'Choose a future final time before confirming.';
    END IF;
    IF rally.final_location IS NULL THEN RAISE EXCEPTION 'Choose a final location before confirming.'; END IF;
    rally.status := 'confirmed';
    rally.confirmed_at := statement_timestamp();
  END IF;
  UPDATE public.rallies SET activity = rally.activity, time_mode = rally.time_mode,
    starts_at = rally.starts_at, location_mode = rally.location_mode, location = rally.location,
    final_time = rally.final_time, final_location = rally.final_location,
    status = rally.status, published_at = rally.published_at,
    confirmed_at = rally.confirmed_at, expires_at = rally.expires_at WHERE id = rally.id;
  PERFORM public.refresh_rallies(NULL, rally.id);
  SELECT * INTO rally FROM public.rallies WHERE id = p_rally_id;
  RETURN rally;
END;
$$;
