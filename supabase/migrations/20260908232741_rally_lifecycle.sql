-- Lifecycle belongs to the shared backend. Response deadlines and archiving
-- are separate from lifecycle; neither silently confirms or cancels a plan.
ALTER TABLE public.rallies DROP CONSTRAINT rallies_status_check;
ALTER TABLE public.rallies ADD COLUMN confirmed_at timestamptz;
UPDATE public.rallies SET confirmed_at = updated_at WHERE status = 'confirmed';
-- Publication is independent from lifecycle: cancelling an unpublished draft
-- must never expose its reserved URL or contents to recipients.
ALTER TABLE public.rallies ADD COLUMN published_at timestamptz;
UPDATE public.rallies SET published_at = created_at WHERE status <> 'draft';
-- Legacy organizers could close responses by setting status to expired before
-- the deadline. Keep those links closed when expiry becomes a separate field.
UPDATE public.rallies SET expires_at = least(expires_at, statement_timestamp())
WHERE status = 'expired';
UPDATE public.rallies SET status = 'open'
WHERE status IN ('collecting', 'choosing_location', 'expired');
ALTER TABLE public.rallies ADD CONSTRAINT rallies_status_check
  CHECK (status IN ('draft', 'open', 'confirmed', 'cancelled', 'completed'));
ALTER TABLE public.rallies ADD COLUMN next_action text NOT NULL DEFAULT 'waiting_for_responses'
  CHECK (next_action IN ('waiting_for_responses', 'choose_time', 'choose_location', 'finalize', 'none'));
ALTER TABLE public.rallies ADD COLUMN archived_at timestamptz;

-- Every public RPC is called by the website server only. Passing a user UUID
-- is safe only after that server verifies the caller's Supabase session.
CREATE FUNCTION public.refresh_rallies(p_user_id uuid DEFAULT NULL, p_rally_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  rally public.rallies;
  new_status text;
  new_action text;
BEGIN
  IF p_user_id IS NULL AND p_rally_id IS NULL THEN
    RAISE EXCEPTION 'A Rally or organizer is required.';
  END IF;
  -- Always lock the parent first; responding and confirming use this same order.
  FOR rally IN SELECT r.* FROM public.rallies r
    WHERE (p_user_id IS NULL OR r.user_id = p_user_id)
      AND (p_rally_id IS NULL OR r.id = p_rally_id)
    ORDER BY r.id FOR UPDATE
  LOOP
    new_status := rally.status;
    IF rally.status IN ('open', 'confirmed')
      AND coalesce(rally.final_time, rally.starts_at) <= statement_timestamp() THEN
      new_status := 'completed';
    END IF;
    new_action := CASE
      WHEN new_status <> 'open' THEN 'none'
      -- An unanswered poll is no longer worth waiting on when all its
      -- options have passed. It still needs an organizer-selected event date.
      WHEN rally.time_mode = 'poll' AND rally.final_time IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.rally_candidates
          WHERE rally_id = rally.id AND starts_at > statement_timestamp())
        THEN 'choose_time'
      WHEN rally.expires_at > statement_timestamp()
        AND NOT EXISTS (SELECT 1 FROM public.responses WHERE rally_id = rally.id)
        THEN 'waiting_for_responses'
      WHEN coalesce(rally.final_time, rally.starts_at) IS NULL THEN 'choose_time'
      WHEN rally.time_mode = 'specific' AND rally.final_time IS NULL
        AND EXISTS (SELECT 1 FROM public.responses WHERE rally_id = rally.id)
        AND NOT EXISTS (SELECT 1 FROM public.responses WHERE rally_id = rally.id AND consensus = 'yes')
        THEN 'choose_time'
      WHEN nullif(btrim(coalesce(rally.final_location, rally.location)), '') IS NULL THEN 'choose_location'
      ELSE 'finalize'
    END;
    IF (rally.status, rally.next_action) IS DISTINCT FROM (new_status, new_action) THEN
      UPDATE public.rallies SET status = new_status, next_action = new_action WHERE id = rally.id;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION private.validate_rally_plan(p_rally public.rallies, p_candidates timestamptz[], p_complete boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_rally.time_mode NOT IN ('specific', 'poll') OR p_rally.location_mode NOT IN ('specific', 'open')
    OR p_rally.time_mode IS NULL OR p_rally.location_mode IS NULL THEN
    RAISE EXCEPTION 'Choose a time and location mode.';
  END IF;
  IF char_length(p_rally.activity) > 200 OR char_length(p_rally.location) > 200
    OR char_length(p_rally.final_location) > 200 THEN
    RAISE EXCEPTION 'The activity or location is too long.';
  END IF;
  IF coalesce(cardinality(p_candidates), 0) > 10 THEN
    RAISE EXCEPTION 'Choose up to ten time options.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_candidates) t WHERE t IS NULL OR NOT isfinite(t))
    OR (p_rally.starts_at IS NOT NULL AND NOT isfinite(p_rally.starts_at)) THEN
    RAISE EXCEPTION 'Choose a valid time.';
  END IF;
  IF p_complete THEN
    IF nullif(btrim(p_rally.activity), '') IS NULL THEN
      RAISE EXCEPTION 'Add an activity before sharing this Rally.';
    END IF;
    IF p_rally.time_mode = 'specific' AND
      (p_rally.starts_at IS NULL OR p_rally.starts_at <= statement_timestamp()) THEN
      RAISE EXCEPTION 'Choose a future time before sharing this Rally.';
    END IF;
    IF p_rally.time_mode = 'poll' AND (coalesce(cardinality(p_candidates), 0) = 0
      OR EXISTS (SELECT 1 FROM unnest(p_candidates) t WHERE t <= statement_timestamp())) THEN
      RAISE EXCEPTION 'Add future time options before sharing this Rally.';
    END IF;
    IF p_rally.location_mode = 'specific' AND nullif(btrim(p_rally.location), '') IS NULL THEN
      RAISE EXCEPTION 'Add a location before sharing this Rally.';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.create_rally(p_payload jsonb, p_user_id uuid, p_invite_token text, p_creator_token text)
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
    status, published_at, user_id, invite_token, creator_token)
  VALUES (rally.activity, rally.time_mode, rally.starts_at, rally.location_mode, rally.location,
    rally.status, CASE WHEN rally.status = 'open' THEN statement_timestamp() END,
    p_user_id, p_invite_token, p_creator_token) RETURNING * INTO rally;
  INSERT INTO public.rally_candidates (rally_id, starts_at, position)
    SELECT rally.id, starts_at, position - 1 FROM unnest(candidates) WITH ORDINALITY AS c(starts_at, position);
  PERFORM public.refresh_rallies(NULL, rally.id);
  SELECT * INTO rally FROM public.rallies WHERE id = rally.id;
  RETURN rally;
END;
$$;

CREATE FUNCTION public.manage_rally(p_rally_id uuid, p_user_id uuid, p_creator_token text, p_patch jsonb)
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
  IF action NOT IN ('save', 'publish', 'confirm', 'cancel', 'archive', 'unarchive') THEN
    RAISE EXCEPTION 'Invalid Rally action.';
  END IF;
  IF action IN ('archive', 'unarchive') THEN
    UPDATE public.rallies SET archived_at = CASE WHEN action = 'archive' THEN statement_timestamp() END
      WHERE id = rally.id RETURNING * INTO rally;
    RETURN rally;
  END IF;
  IF action = 'cancel' THEN
    IF rally.status NOT IN ('draft', 'open', 'confirmed', 'cancelled') THEN
      RAISE EXCEPTION 'A completed Rally cannot be cancelled.';
    END IF;
    UPDATE public.rallies SET status = 'cancelled', next_action = 'none' WHERE id = rally.id RETURNING * INTO rally;
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

CREATE FUNCTION public.respond_to_rally(p_invite_token text, p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  rally public.rallies;
  v_response_id uuid := (p_payload->>'responseId')::uuid;
  response_name text := btrim(p_payload->>'name');
  response_consensus text := p_payload->>'consensus';
  response_note text := nullif(btrim(p_payload->>'note'), '');
  suggestion text := nullif(btrim(p_payload->>'locationSuggestion'), '');
  available uuid[];
  time_suggestions timestamptz[];
BEGIN
  SELECT * INTO rally FROM public.rallies WHERE invite_token = p_invite_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This link is not valid.'; END IF;
  PERFORM public.refresh_rallies(NULL, rally.id);
  SELECT * INTO rally FROM public.rallies WHERE invite_token = p_invite_token;
  IF rally.published_at IS NULL OR rally.status <> 'open' THEN
    RAISE EXCEPTION 'This Rally is not accepting responses.';
  END IF;
  IF rally.expires_at <= statement_timestamp() THEN RAISE EXCEPTION 'This Rally response link has expired.'; END IF;
  IF response_name IS NULL OR char_length(response_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Enter a name up to 60 characters.';
  END IF;
  IF char_length(response_note) > 300 OR char_length(suggestion) > 200 THEN
    RAISE EXCEPTION 'Your note or location suggestion is too long.';
  END IF;
  IF response_consensus IS NULL OR
    (rally.time_mode = 'specific' AND response_consensus NOT IN ('yes', 'no', 'another_day')) OR
    (rally.time_mode = 'poll' AND response_consensus NOT IN ('some_work', 'none_work')) THEN
    RAISE EXCEPTION 'Choose a response to the proposed time.';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value::uuid), ARRAY[]::uuid[]) INTO available
    FROM jsonb_array_elements_text(coalesce(p_payload->'available', '[]'::jsonb));
  IF cardinality(available) > 10 OR EXISTS (
    SELECT 1 FROM unnest(available) candidate_id
      WHERE candidate_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.rally_candidates c WHERE c.id = candidate_id AND c.rally_id = rally.id
      )
  ) THEN RAISE EXCEPTION 'A selected time does not belong to this Rally.'; END IF;
  IF (rally.time_mode = 'specific' AND cardinality(available) > 0)
    OR (response_consensus = 'none_work' AND cardinality(available) > 0)
    OR (response_consensus = 'some_work' AND cardinality(available) = 0) THEN
    RAISE EXCEPTION 'Choose the time options that work for you.';
  END IF;
  SELECT coalesce(array_agg(value::timestamptz), ARRAY[]::timestamptz[]) INTO time_suggestions
    FROM jsonb_array_elements_text(coalesce(p_payload->'timeSuggestions', '[]'::jsonb));
  IF cardinality(time_suggestions) > 3 OR EXISTS (
    SELECT 1 FROM unnest(time_suggestions) t WHERE t IS NULL OR NOT isfinite(t) OR t <= statement_timestamp()
  ) THEN RAISE EXCEPTION 'Suggest up to three future times.'; END IF;
  IF v_response_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.responses r WHERE r.id = v_response_id AND r.rally_id = rally.id
  ) THEN RAISE EXCEPTION 'Your saved response is not valid for this Rally.'; END IF;
  IF EXISTS (SELECT 1 FROM public.responses r WHERE r.rally_id = rally.id
    AND r.name = response_name AND r.id IS DISTINCT FROM v_response_id) THEN
    RAISE EXCEPTION 'That name is already used. Add an initial or use the device where you first replied.';
  END IF;
  IF v_response_id IS NULL THEN
    INSERT INTO public.responses (rally_id, name, consensus, note)
      VALUES (rally.id, response_name, response_consensus, response_note) RETURNING id INTO v_response_id;
  ELSE
    UPDATE public.responses SET name = response_name, consensus = response_consensus, note = response_note
      WHERE id = v_response_id;
  END IF;
  DELETE FROM public.response_candidates rc WHERE rc.response_id = v_response_id;
  INSERT INTO public.response_candidates (response_id, candidate_id, available)
    SELECT v_response_id, candidate_id, true FROM unnest(available) candidate_id;
  DELETE FROM public.location_suggestions s WHERE s.response_id = v_response_id;
  IF rally.location_mode = 'open' AND suggestion IS NOT NULL THEN
    INSERT INTO public.location_suggestions (rally_id, response_id, text) VALUES (rally.id, v_response_id, suggestion);
  END IF;
  DELETE FROM public.time_suggestions s WHERE s.response_id = v_response_id;
  INSERT INTO public.time_suggestions (rally_id, response_id, starts_at)
    SELECT rally.id, v_response_id, t FROM unnest(time_suggestions) t;
  PERFORM public.refresh_rallies(NULL, rally.id);
  RETURN v_response_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_rallies(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_rally(jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_rally(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_rally(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_rally_plan(public.rallies, timestamptz[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_rallies(uuid, uuid), public.create_rally(jsonb, uuid, text, text),
  public.manage_rally(uuid, uuid, text, jsonb), public.respond_to_rally(text, jsonb) TO service_role;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.validate_rally_plan(public.rallies, timestamptz[], boolean) TO service_role;

-- Recalculate legacy records once. Later reads and writes refresh only the
-- requested Rally or organizer, without a paid scheduler or keep-alive job.
DO $$ DECLARE rally_id uuid; BEGIN
  FOR rally_id IN SELECT id FROM public.rallies ORDER BY id LOOP
    PERFORM public.refresh_rallies(NULL, rally_id);
  END LOOP;
END $$;
