import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type SessionState = { loading: boolean; email: string | null; signedIn: boolean };

/** Minimal client-side session read for the optional account layer. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    email: null,
    signedIn: false,
  });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({
        loading: false,
        email: data.session?.user.email ?? null,
        signedIn: !!data.session,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setState({
        loading: false,
        email: session?.user.email ?? null,
        signedIn: !!session,
      });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
