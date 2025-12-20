import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  FileSignature, 
  ExternalLink,
  Loader2 
} from 'lucide-react';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  signature: <FileSignature className="h-5 w-5 text-primary" />,
  general: <Bell className="h-5 w-5 text-muted-foreground" />,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  signature: 'bg-primary/10 border-primary/20',
  general: 'bg-muted/50 border-border',
};

export default function Notifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    deleteAllNotifications 
  } = useNotifications();
  
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleNotificationClick = async (notification: Notification) => {
    setSelectedNotification(notification);
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
  };

  const handleDelete = async (notificationId: string) => {
    setDeleting(notificationId);
    await deleteNotification(notificationId);
    if (selectedNotification?.id === notificationId) {
      setSelectedNotification(null);
    }
    setDeleting(null);
    toast({
      title: 'تم الحذف',
      description: 'تم حذف الإشعار بنجاح',
    });
  };

  const handleDeleteAll = async () => {
    await deleteAllNotifications();
    setSelectedNotification(null);
    setDeleteAllOpen(false);
    toast({
      title: 'تم الحذف',
      description: 'تم حذف جميع الإشعارات',
    });
  };

  const handleNavigate = (notification: Notification) => {
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
    } catch {
      return '';
    }
  };

  const formatFullDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMMM yyyy - HH:mm', { locale: ar });
    } catch {
      return '';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">الإشعارات</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : 'جميع الإشعارات مقروءة'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-2">
                <CheckCheck className="h-4 w-4" />
                قراءة الكل
              </Button>
            )}
            {notifications.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDeleteAllOpen(true)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                حذف الكل
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notifications List */}
          <div className="lg:col-span-2 space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : notifications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">لا توجد إشعارات</h3>
                  <p className="text-muted-foreground text-sm">
                    ستظهر هنا الإشعارات عند حدوث أي نشاط
                  </p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((notification) => (
                <Card 
                  key={notification.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedNotification?.id === notification.id ? 'ring-2 ring-primary' : ''
                  } ${!notification.is_read ? NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.general : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-full ${NOTIFICATION_COLORS[notification.type] || NOTIFICATION_COLORS.general}`}>
                        {NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.general}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-medium ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notification.title}
                          </h3>
                          {!notification.is_read && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              جديد
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={deleting === notification.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                        >
                          {deleting === notification.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Notification Details */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="text-lg">تفاصيل الإشعار</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedNotification ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-full ${NOTIFICATION_COLORS[selectedNotification.type] || NOTIFICATION_COLORS.general}`}>
                        {NOTIFICATION_ICONS[selectedNotification.type] || NOTIFICATION_ICONS.general}
                      </div>
                      <div>
                        <h3 className="font-semibold">{selectedNotification.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {formatFullDate(selectedNotification.created_at)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm leading-relaxed">{selectedNotification.message}</p>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">النوع:</span>
                        <Badge variant="outline">
                          {selectedNotification.type === 'signature' ? 'توقيع' : 'عام'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الحالة:</span>
                        <Badge variant={selectedNotification.is_read ? 'secondary' : 'default'}>
                          {selectedNotification.is_read ? 'مقروء' : 'غير مقروء'}
                        </Badge>
                      </div>
                      {selectedNotification.read_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">تمت القراءة:</span>
                          <span className="text-xs">{formatFullDate(selectedNotification.read_at)}</span>
                        </div>
                      )}
                    </div>

                    {selectedNotification.link && (
                      <Button 
                        className="w-full gap-2" 
                        onClick={() => handleNavigate(selectedNotification)}
                      >
                        <ExternalLink className="h-4 w-4" />
                        الانتقال للتفاصيل
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">اختر إشعار لعرض تفاصيله</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete All Dialog */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف جميع الإشعارات</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف جميع الإشعارات؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
