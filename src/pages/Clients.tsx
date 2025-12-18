import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Phone,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClientDrawer } from "@/components/clients/ClientDrawer";
import { ClientDetails } from "@/components/clients/ClientDetails";
import { RowActionsMenu } from "@/components/shared/RowActionsMenu";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

interface Client {
  id: string;
  full_name: string;
  id_number: string;
  file_number: string | null;
  phone_number: string | null;
  date_joined: string | null;
  less_than_24: boolean | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  broker_id: string | null;
}

export default function Clients() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (searchQuery) {
        query = query.or(
          `full_name.ilike.%${searchQuery}%,id_number.ilike.%${searchQuery}%,file_number.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setClients(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({ title: "خطأ", description: "فشل في تحميل العملاء", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleDelete = async () => {
    if (!deletingClient) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deletingClient.id);

      if (error) throw error;
      toast({ title: "تم الحذف", description: "تم حذف العميل بنجاح" });
      fetchClients();
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في حذف العميل", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      setDeletingClient(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString('ar-EG');
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (viewingClient) {
    return (
      <ClientDetails
        client={viewingClient}
        onBack={() => setViewingClient(null)}
        onEdit={() => {
          setSelectedClient(viewingClient);
          setDrawerOpen(true);
        }}
        onRefresh={() => {
          fetchClients();
          // Refresh the viewing client data
          supabase
            .from('clients')
            .select('*')
            .eq('id', viewingClient.id)
            .single()
            .then(({ data }) => {
              if (data) setViewingClient(data);
            });
        }}
      />
    );
  }

  return (
    <MainLayout>
      <Header
        title="العملاء"
        subtitle="إدارة قاعدة بيانات العملاء"
        action={{
          label: "إضافة عميل",
          onClick: () => {
            setSelectedClient(null);
            setDrawerOpen(true);
          },
        }}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم، رقم الهوية، رقم الملف، الهاتف..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pr-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="ml-2 h-4 w-4" />
              فلترة
            </Button>
            <Button variant="outline" size="sm">
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-medium">العميل</TableHead>
                  <TableHead className="text-muted-foreground font-medium">رقم الهوية</TableHead>
                  <TableHead className="text-muted-foreground font-medium">رقم الملف</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الهاتف</TableHead>
                  <TableHead className="text-muted-foreground font-medium">تاريخ الانضمام</TableHead>
                  <TableHead className="text-muted-foreground font-medium">العمر</TableHead>
                  <TableHead className="text-muted-foreground font-medium w-[80px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client, index) => (
                    <TableRow
                      key={client.id}
                      className={cn(
                        "border-border/30 transition-colors cursor-pointer",
                        "hover:bg-secondary/50 animate-fade-in"
                      )}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => setViewingClient(client)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-sm font-medium text-primary">
                              {client.full_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{client.full_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground" dir="ltr">
                        {client.id_number}
                      </TableCell>
                      <TableCell>
                        {client.file_number ? (
                          <Badge variant="outline" className="font-mono">
                            {client.file_number}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {client.phone_number ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground" dir="ltr">
                            <Phone className="h-3 w-3" />
                            {client.phone_number}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(client.date_joined)}
                      </TableCell>
                      <TableCell>
                        {client.less_than_24 ? (
                          <Badge variant="warning">أقل من 24</Badge>
                        ) : (
                          <Badge variant="secondary">24+</Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          onView={() => setViewingClient(client)}
                          onEdit={() => {
                            setSelectedClient(client);
                            setDrawerOpen(true);
                          }}
                          onDelete={() => {
                            setDeletingClient(client);
                            setDeleteDialogOpen(true);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              عرض {clients.length} من {totalCount} عميل
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {currentPage} من {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ClientDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        client={selectedClient}
        onSaved={() => {
          fetchClients();
          setDrawerOpen(false);
        }}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="حذف العميل"
        description={`هل أنت متأكد من حذف العميل "${deletingClient?.full_name}"؟`}
        loading={deleteLoading}
      />
    </MainLayout>
  );
}