import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, ExternalLink, FileSignature, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  signature: <FileSignature className="h-4 w-4 text-primary" />,
  general: <Bell className="h-4 w-4 text-muted-foreground" />,
};

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
    } catch {
      return '';
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
          <Bell className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -left-1 -top-1 h-4 w-4 md:h-5 md:w-5 rounded-full p-0 text-[9px] md:text-[10px] flex items-center justify-center" 
              variant="destructive"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 md:w-96">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">الإشعارات</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  markAllAsRead();
                }}
              >
                <CheckCheck className="h-3 w-3" />
                قراءة الكل
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs"
              onClick={() => {
                navigate('/notifications');
                setOpen(false);
              }}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        <ScrollArea className="h-[300px] md:h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">لا توجد إشعارات</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.general}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-primary cursor-pointer"
              onClick={() => {
                navigate('/notifications');
                setOpen(false);
              }}
            >
              عرض جميع الإشعارات
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
