-- Retain only unguessable link identifiers so old links can show a deleted page.
CREATE TABLE public.deleted_rallies (
  invite_token text PRIMARY KEY,
  creator_token text NOT NULL UNIQUE,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deleted_rallies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_rallies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.deleted_rallies TO service_role;

CREATE FUNCTION public.delete_rally(
  p_rally_id uuid, p_user_id uuid, p_creator_token text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target public.rallies;
BEGIN
  SELECT * INTO target FROM public.rallies WHERE id = p_rally_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF target.user_id IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM target.user_id THEN RETURN false; END IF;
  ELSIF p_creator_token IS DISTINCT FROM target.creator_token THEN
    RETURN false;
  END IF;
  INSERT INTO public.deleted_rallies(invite_token, creator_token)
    VALUES (target.invite_token, target.creator_token);
  DELETE FROM public.rallies WHERE id = target.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_rally(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_rally(uuid, uuid, text) TO service_role;
