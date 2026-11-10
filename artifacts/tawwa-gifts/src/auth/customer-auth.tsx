import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createCustomerSupabaseClient } from "./supabase";

type CustomerAuthValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createCustomerSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setLoading(false);
      }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setSession(null);
      else setSession(data.session);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<CustomerAuthValue>(() => ({
    configured: Boolean(client),
    loading,
    user: session?.user ?? null,
    signIn: async (email, password) => {
      if (!client) throw new Error("Authentication is not configured.");
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      if (!client) throw new Error("Authentication is not configured.");
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return { confirmationRequired: !data.session };
    },
    signOut: async () => {
      if (!client) return;
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
  }), [client, loading, session]);

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const value = useContext(CustomerAuthContext);
  if (!value) throw new Error("Customer authentication is unavailable.");
  return value;
}
