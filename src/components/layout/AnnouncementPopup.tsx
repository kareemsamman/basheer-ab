import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  show_once: boolean;
}

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const fetchAnnouncement = async () => {
      // Get active announcements
      const { data: announcements, error } = await supabase
        .from("announcements")
        .select("id, title, content, show_once")
        .eq("is_active", true)
        .lte("start_date", new Date().toISOString())
        .gte("end_date", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (error || !announcements?.length) return;

      const ann = announcements[0];

      // Check if user dismissed this announcement
      const { data: dismissal } = await supabase
        .from("announcement_dismissals")
        .select("id")
        .eq("announcement_id", ann.id)
        .eq("user_id", user.id)
        .maybeSingle();

      // If show_once and already dismissed, don't show
      if (ann.show_once && dismissal) return;

      // For recurring announcements, check if dismissed today
      if (!ann.show_once && dismissal) {
        // Already dismissed, don't show again (per session handled by state)
        return;
      }

      setAnnouncement(ann);
      setOpen(true);
    };

    fetchAnnouncement();
  }, [user?.id]);

  const handleDismiss = async () => {
    if (!announcement || !user?.id) return;

    // Record dismissal
    await supabase.from("announcement_dismissals").upsert(
      {
        announcement_id: announcement.id,
        user_id: user.id,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,user_id" }
    );

    setOpen(false);
  };

  if (!announcement) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Megaphone className="h-5 w-5" />
            {announcement.title}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-base text-foreground whitespace-pre-wrap leading-relaxed">
          {announcement.content}
        </DialogDescription>
        <DialogFooter>
          <Button onClick={handleDismiss} className="w-full">
            فهمت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
