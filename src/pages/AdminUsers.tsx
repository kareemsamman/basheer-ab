import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useBranches } from "@/hooks/useBranches";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserCheck,
  UserX,
  Shield,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Building2,
  Phone,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { UserSessionsTab } from "@/components/admin/UserSessionsTab";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'active' | 'blocked';
  created_at: string;
  updated_at: string;
  branch_id: string | null;
  pbx_extension: string | null;
}

interface UserRole {
  user_id: string;
  role: 'admin' | 'worker';
}

interface UserWithRole extends UserProfile {
  role?: 'admin' | 'worker';
}

interface LoginAttempt {
  id: string;
  email: string;
  created_at: string;
  success: boolean;
  ip_address: string | null;
}

export default function AdminUsers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { branches, getBranchName } = useBranches();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Record<string, 'admin' | 'worker'>>({});
  const [selectedBranch, setSelectedBranch] = useState<Record<string, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: string;
    action: 'approve' | 'block' | 'unblock';
    userName: string;
  } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = (roles || []).find(r => r.user_id === profile.id);
        return {
          ...profile,
          role: userRole?.role as 'admin' | 'worker' | undefined,
        };
      });

      setUsers(usersWithRoles);

      // Initialize selected roles and branches for pending users
      const roleSelections: Record<string, 'admin' | 'worker'> = {};
      const branchSelections: Record<string, string> = {};
      usersWithRoles.forEach(u => {
        if (u.status === 'pending') {
          roleSelections[u.id] = 'worker';
          // Default to first branch if available
          if (branches.length > 0) {
            branchSelections[u.id] = branches[0].id;
          }
        }
      });
      setSelectedRole(roleSelections);
      setSelectedBranch(branchSelections);

      // Fetch login attempts
      const { data: attempts, error: attemptsError } = await supabase
        .from('login_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!attemptsError) {
        setLoginAttempts(attempts || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات المستخدمين",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleApproveUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const role = selectedRole[userId] || 'worker';
      const branchId = selectedBranch[userId] || (branches.length > 0 ? branches[0].id : null);

      // Update profile status to active and set branch
      const updateData: { status: 'active' | 'pending' | 'blocked'; branch_id?: string } = { status: 'active' };
      if (branchId) {
        updateData.branch_id = branchId;
      }
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (profileError) throw profileError;

      // Add user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });

      if (roleError) throw roleError;

      toast({
        title: "تم التفعيل",
        description: "تم تفعيل المستخدم بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: "خطأ",
        description: "فشل في تفعيل المستخدم",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleBlockUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'blocked' })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "تم الحظر",
        description: "تم حظر المستخدم بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: "خطأ",
        description: "فشل في حظر المستخدم",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "تم إلغاء الحظر",
        description: "تم إلغاء حظر المستخدم بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast({
        title: "خطأ",
        description: "فشل في إلغاء حظر المستخدم",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'admin' | 'worker') => {
    setActionLoading(userId);
    try {
      // Delete existing roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (error) throw error;

      toast({
        title: "تم التحديث",
        description: "تم تحديث دور المستخدم بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error changing role:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحديث دور المستخدم",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeBranch = async (userId: string, branchId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ branch_id: branchId })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "تم التحديث",
        description: "تم تحديث فرع المستخدم بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error changing branch:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحديث فرع المستخدم",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeExtension = async (userId: string, extension: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pbx_extension: extension || null } as any)
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "تم التحديث",
        description: "تم تحديث رقم التحويلة بنجاح",
      });

      fetchUsers();
    } catch (error) {
      console.error('Error changing extension:', error);
      toast({
        title: "خطأ",
        description: "فشل في تحديث رقم التحويلة",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeUsers = users.filter(u => u.status === 'active');
  const blockedUsers = users.filter(u => u.status === 'blocked');

  // Redirect non-admins
  if (!authLoading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30"><Clock className="h-3 w-3 ml-1" />معلق</Badge>;
      case 'active':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30"><CheckCircle className="h-3 w-3 ml-1" />نشط</Badge>;
      case 'blocked':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="h-3 w-3 ml-1" />محظور</Badge>;
      default:
        return null;
    }
  };

  const getRoleBadge = (role?: string) => {
    if (role === 'admin') {
      return <Badge className="bg-primary/10 text-primary border-primary/30"><Shield className="h-3 w-3 ml-1" />مدير</Badge>;
    }
    return <Badge variant="secondary"><User className="h-3 w-3 ml-1" />موظف</Badge>;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'yyyy/MM/dd HH:mm', { locale: ar });
  };

  const renderTableSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">المستخدمون</h1>
            <p className="text-muted-foreground">إدارة المستخدمين والصلاحيات</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">بانتظار الموافقة</p>
                <p className="text-2xl font-bold">{pendingUsers.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">مستخدمون نشطون</p>
                <p className="text-2xl font-bold">{activeUsers.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">محظورون</p>
                <p className="text-2xl font-bold">{blockedUsers.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المستخدمين</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList className="grid w-full max-w-xl grid-cols-4">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              معلق ({pendingUsers.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              نشط ({activeUsers.length})
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-2">
              <XCircle className="h-4 w-4" />
              محظور ({blockedUsers.length})
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2">
              <History className="h-4 w-4" />
              سجل الجلسات
            </TabsTrigger>
          </TabsList>

          {/* Pending Users */}
          <TabsContent value="pending">
            <div className="rounded-lg border bg-card">
              {loading ? (
                <div className="p-4">{renderTableSkeleton()}</div>
              ) : pendingUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا يوجد مستخدمون بانتظار الموافقة</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">البريد الإلكتروني</TableHead>
                      <TableHead className="text-right">تاريخ التسجيل</TableHead>
                      <TableHead className="text-right">الفرع</TableHead>
                      <TableHead className="text-right">الدور</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.full_name || 'غير محدد'}
                        </TableCell>
                        <TableCell className="text-right">
                          <bdi>{user.email}</bdi>
                        </TableCell>
                        <TableCell>{formatDate(user.created_at)}</TableCell>
                        <TableCell>
                          <Select
                            value={selectedBranch[user.id] || (branches.length > 0 ? branches[0].id : '')}
                            onValueChange={(value) => 
                              setSelectedBranch(prev => ({ ...prev, [user.id]: value }))
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="اختر الفرع" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map(branch => (
                                <SelectItem key={branch.id} value={branch.id}>
                                  {branch.name_ar || branch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={selectedRole[user.id] || 'worker'}
                            onValueChange={(value: 'admin' | 'worker') => 
                              setSelectedRole(prev => ({ ...prev, [user.id]: value }))
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="worker">موظف</SelectItem>
                              <SelectItem value="admin">مدير</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => setConfirmDialog({
                              open: true,
                              userId: user.id,
                              action: 'approve',
                              userName: user.full_name || user.email,
                            })}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 ml-1" />
                                تفعيل
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Active Users */}
          <TabsContent value="active">
            <div className="rounded-lg border bg-card">
              {loading ? (
                <div className="p-4">{renderTableSkeleton()}</div>
              ) : activeUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا يوجد مستخدمون نشطون</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">البريد الإلكتروني</TableHead>
                      <TableHead className="text-right">الفرع</TableHead>
                      <TableHead className="text-right">الدور</TableHead>
                      <TableHead className="text-right">
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          التحويلة
                        </div>
                      </TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.full_name || 'غير محدد'}
                        </TableCell>
                        <TableCell className="text-right">
                          <bdi>{user.email}</bdi>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.branch_id || ''}
                            onValueChange={(value) => handleChangeBranch(user.id, value)}
                            disabled={actionLoading === user.id || user.email === 'morshed500@gmail.com'}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="اختر الفرع" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map(branch => (
                                <SelectItem key={branch.id} value={branch.id}>
                                  {branch.name_ar || branch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role || 'worker'}
                            onValueChange={(value: 'admin' | 'worker') => 
                              handleChangeRole(user.id, value)
                            }
                            disabled={actionLoading === user.id || user.email === 'morshed500@gmail.com'}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="worker">موظف</SelectItem>
                              <SelectItem value="admin">مدير</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <input
                            type="text"
                            className="w-20 px-2 py-1 text-sm border rounded bg-background text-center ltr-input"
                            placeholder="101"
                            defaultValue={user.pbx_extension || ''}
                            onBlur={(e) => {
                              const newValue = e.target.value.trim();
                              if (newValue !== (user.pbx_extension || '')) {
                                handleChangeExtension(user.id, newValue);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={actionLoading === user.id}
                          />
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          {user.email !== 'morshed500@gmail.com' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmDialog({
                                open: true,
                                userId: user.id,
                                action: 'block',
                                userName: user.full_name || user.email,
                              })}
                              disabled={actionLoading === user.id}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <UserX className="h-4 w-4 ml-1" />
                                  حظر
                                </>
                              )}
                            </Button>
                          )}
                          {user.email === 'morshed500@gmail.com' && (
                            <Badge variant="outline" className="bg-primary/10 text-primary">
                              <Shield className="h-3 w-3 ml-1" />
                              مدير النظام
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Blocked Users */}
          <TabsContent value="blocked">
            <div className="rounded-lg border bg-card">
              {loading ? (
                <div className="p-4">{renderTableSkeleton()}</div>
              ) : blockedUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <XCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا يوجد مستخدمون محظورون</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">البريد الإلكتروني</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.full_name || 'غير محدد'}
                        </TableCell>
                        <TableCell className="text-right">
                          <bdi>{user.email}</bdi>
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmDialog({
                              open: true,
                              userId: user.id,
                              action: 'unblock',
                              userName: user.full_name || user.email,
                            })}
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 ml-1" />
                                إلغاء الحظر
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* User Sessions Tab */}
          <TabsContent value="sessions">
            <UserSessionsTab />
          </TabsContent>
        </Tabs>

        {/* Recent Login Attempts */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">محاولات الدخول الأخيرة</h2>
          <div className="rounded-lg border bg-card">
            {loading ? (
              <div className="p-4">{renderTableSkeleton()}</div>
            ) : loginAttempts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>لا توجد محاولات دخول مسجلة</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">البريد الإلكتروني</TableHead>
                    <TableHead className="text-right">الوقت</TableHead>
                    <TableHead className="text-right">النتيجة</TableHead>
                    <TableHead className="text-right">عنوان IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginAttempts.slice(0, 10).map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="text-right">
                        <bdi>{attempt.email}</bdi>
                      </TableCell>
                      <TableCell>{formatDate(attempt.created_at)}</TableCell>
                      <TableCell>
                        {attempt.success ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                            نجاح
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                            فشل
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <bdi>{attempt.ip_address || '-'}</bdi>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'approve' && 'تأكيد تفعيل المستخدم'}
              {confirmDialog?.action === 'block' && 'تأكيد حظر المستخدم'}
              {confirmDialog?.action === 'unblock' && 'تأكيد إلغاء الحظر'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'approve' && (
                <>هل أنت متأكد من تفعيل المستخدم <strong>{confirmDialog?.userName}</strong>؟</>
              )}
              {confirmDialog?.action === 'block' && (
                <>هل أنت متأكد من حظر المستخدم <strong>{confirmDialog?.userName}</strong>؟ لن يتمكن من الوصول إلى النظام.</>
              )}
              {confirmDialog?.action === 'unblock' && (
                <>هل أنت متأكد من إلغاء حظر المستخدم <strong>{confirmDialog?.userName}</strong>؟</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog?.action === 'approve') {
                  handleApproveUser(confirmDialog.userId);
                } else if (confirmDialog?.action === 'block') {
                  handleBlockUser(confirmDialog.userId);
                } else if (confirmDialog?.action === 'unblock') {
                  handleUnblockUser(confirmDialog.userId);
                }
              }}
              className={confirmDialog?.action === 'block' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {confirmDialog?.action === 'approve' && 'تفعيل'}
              {confirmDialog?.action === 'block' && 'حظر'}
              {confirmDialog?.action === 'unblock' && 'إلغاء الحظر'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
