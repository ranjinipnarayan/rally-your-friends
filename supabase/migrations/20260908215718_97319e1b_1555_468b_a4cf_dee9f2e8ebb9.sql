CREATE TABLE public.time_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rally_id UUID NOT NULL REFERENCES public.rallies(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX time_suggestions_rally_id_idx ON public.time_suggestions(rally_id);
CREATE INDEX time_suggestions_response_id_idx ON public.time_suggestions(response_id);
GRANT ALL ON public.time_suggestions TO service_role;
ALTER TABLE public.time_suggestions ENABLE ROW LEVEL SECURITY;