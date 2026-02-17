import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SiteSettings {
  id: string;
  site_title: string;
  site_description: string;
  logo_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

export function useSiteSettings() {
  return useQuery({
    queryKey: ["site-settings"],
    queryFn: async (): Promise<SiteSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;
      return data as SiteSettings;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useUpdateSiteSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<SiteSettings, "id" | "updated_at" | "updated_by">>) => {
      // Get the single row
      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .limit(1)
        .single();

      if (!existing) throw new Error("No settings row found");

      const { data, error } = await supabase
        .from("site_settings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    },
  });
}
