CREATE TABLE public.rallies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity text NOT NULL DEFAULT 'Let''s hang out',
  time_mode text NOT NULL CHECK (time_mode IN ('specific','poll')),
  starts_at timestamptz,
  location_mode text NOT NULL CHECK (location_mode IN ('specific','open')),
  location text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','collecting','choosing_location','confirmed','expired')),
  final_time timestamptz,
  final_location text,
  invite_token text NOT NULL UNIQUE,
  creator_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rally_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rally_id uuid NOT NULL REFERENCES public.rallies(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rally_candidates_rally_id_idx ON public.rally_candidates(rally_id);

CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rally_id uuid NOT NULL REFERENCES public.rallies(id) ON DELETE CASCADE,
  name text NOT NULL,
  consensus text CHECK (consensus IN ('yes','no','another_day','none_work','some_work')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rally_id, name)
);
CREATE INDEX responses_rally_id_idx ON public.responses(rally_id);

CREATE TABLE public.response_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.rally_candidates(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT false,
  UNIQUE (response_id, candidate_id)
);
CREATE INDEX response_candidates_response_id_idx ON public.response_candidates(response_id);

CREATE TABLE public.location_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rally_id uuid NOT NULL REFERENCES public.rallies(id) ON DELETE CASCADE,
  response_id uuid REFERENCES public.responses(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_suggestions_rally_id_idx ON public.location_suggestions(rally_id);

GRANT ALL ON public.rallies TO service_role;
GRANT ALL ON public.rally_candidates TO service_role;
GRANT ALL ON public.responses TO service_role;
GRANT ALL ON public.response_candidates TO service_role;
GRANT ALL ON public.location_suggestions TO service_role;

ALTER TABLE public.rallies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rally_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_suggestions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rally_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rallies_touch_updated_at BEFORE UPDATE ON public.rallies
  FOR EACH ROW EXECUTE FUNCTION public.rally_touch_updated_at();
CREATE TRIGGER responses_touch_updated_at BEFORE UPDATE ON public.responses
  FOR EACH ROW EXECUTE FUNCTION public.rally_touch_updated_at();