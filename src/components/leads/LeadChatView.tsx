import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { RefreshCw, Bot, User, Phone, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface LeadMessage {
  id: string;
  lead_id: string;
  phone: string;
  message_type: "ai" | "human";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface LeadChatViewProps {
  leadId: string;
  phone: string;
}

export function LeadChatView({ leadId, phone }: LeadChatViewProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Fetch messages from Supabase
  const { data: messages, isLoading } = useQuery({
    queryKey: ["lead-messages", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as LeadMessage[];
    },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-whatsapp-chat", {
        body: { phone, lead_id: leadId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead-messages", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      
      if (data.requiresCallback) {
        toast({
          title: "🔔 طلب اتصال!",
          description: "العميل أكد رغبته بالاتصال، يرجى التواصل معه",
          variant: "default",
        });
      } else {
        toast({ title: `تم مزامنة ${data.synced} رسالة` });
      }
    },
    onError: (error) => {
      toast({
        title: "فشل المزامنة",
        description: error instanceof Error ? error.message : "خطأ غير معروف",
        variant: "destructive",
      });
    },
  });

  // Auto-sync on first load
  useEffect(() => {
    if (isFirstLoad && phone) {
      syncMutation.mutate();
      setIsFirstLoad(false);
    }
  }, [phone, isFirstLoad]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`lead-messages-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["lead-messages", leadId] });
          
          // Check if new message indicates callback request
          const newMsg = payload.new as LeadMessage;
          if (newMsg.message_type === "ai" && newMsg.content.includes("تم تسجيل طلبك")) {
            toast({
              title: "🔔 طلب اتصال جديد!",
              description: "العميل أكد رغبته بالاتصال",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (isLoading && !messages) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - WhatsApp style */}
      <div className="flex items-center justify-between p-3 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <span className="font-medium">محادثة WhatsApp</span>
          <Badge variant="secondary" className="text-xs">
            {messages?.length || 0} رسالة
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="text-primary-foreground hover:bg-primary/80"
        >
          <RefreshCw className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")} />
          <span className="mr-1 text-xs">مزامنة</span>
        </Button>
      </div>

      {/* Chat Messages - WhatsApp style background */}
      <ScrollArea 
        ref={scrollRef}
        className="flex-1 p-3 bg-muted/30"
      >
        <div className="space-y-2 max-w-md mx-auto">
          {messages && messages.length > 0 ? (
            messages.map((msg, index) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.message_type === "human" ? "justify-start" : "justify-end"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 shadow-sm relative",
                    msg.message_type === "human"
                      ? "bg-card border rounded-tl-none"
                      : "bg-accent rounded-tr-none"
                  )}
                >
                  {/* Message type indicator */}
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] mb-1",
                    msg.message_type === "human" 
                      ? "text-primary" 
                      : "text-primary"
                  )}>
                    {msg.message_type === "human" ? (
                      <>
                        <User className="h-3 w-3" />
                        <span>العميل</span>
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3" />
                        <span>Bot</span>
                      </>
                    )}
                  </div>
                  
                  {/* Content */}
                  <p className="text-sm whitespace-pre-wrap break-words text-foreground">
                    {msg.content}
                  </p>

                  {/* Highlight callback request */}
                  {msg.message_type === "ai" && msg.content.includes("تم تسجيل طلبك") && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
                      <Phone className="h-3 w-3" />
                      <span>طلب اتصال!</span>
                    </div>
                  )}

                  {/* Time */}
                  <p className="text-[10px] text-muted-foreground text-left mt-1">
                    {index === 0 
                      ? format(new Date(msg.created_at), "Pp", { locale: ar })
                      : ""
                    }
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 opacity-30 mb-2" />
              <p className="text-sm">لا توجد رسائل</p>
              <p className="text-xs">اضغط مزامنة لجلب المحادثة من WhatsApp</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sync status */}
      {syncMutation.isPending && (
        <div className="p-2 bg-muted text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          جاري مزامنة المحادثة من Redis...
        </div>
      )}
    </div>
  );
}
