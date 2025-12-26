import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, User, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { InsuranceTypeCards } from "./InsuranceTypeCards";
import { CreateClientForm } from "./CreateClientForm";
import type { InsuranceCategory, Client, Broker, NewClientForm, ValidationErrors } from "./types";

interface Step1Props {
  // Branch
  isAdmin: boolean;
  branches: Array<{ id: string; name: string; name_ar: string | null }>;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  
  // Category
  categories: InsuranceCategory[];
  selectedCategory: InsuranceCategory | null;
  onCategoryChange: (category: InsuranceCategory) => void;
  
  // Client
  clientSearch: string;
  setClientSearch: (search: string) => void;
  clients: Client[];
  setClients: (clients: Client[]) => void;
  loadingClients: boolean;
  setLoadingClients: (loading: boolean) => void;
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  createNewClient: boolean;
  setCreateNewClient: (create: boolean) => void;
  newClient: NewClientForm;
  setNewClient: (client: NewClientForm) => void;
  checkingDuplicate: boolean;
  setCheckingDuplicate: (checking: boolean) => void;
  
  // Errors
  errors: ValidationErrors;
  setErrors: (errors: ValidationErrors) => void;
}

export function Step1BranchTypeClient({
  isAdmin,
  branches,
  selectedBranchId,
  setSelectedBranchId,
  categories,
  selectedCategory,
  onCategoryChange,
  clientSearch,
  setClientSearch,
  clients,
  setClients,
  loadingClients,
  setLoadingClients,
  selectedClient,
  setSelectedClient,
  createNewClient,
  setCreateNewClient,
  newClient,
  setNewClient,
  checkingDuplicate,
  setCheckingDuplicate,
  errors,
  setErrors,
}: Step1Props) {
  // Search clients
  const searchClients = async (query: string) => {
    if (query.length < 2) {
      setClients([]);
      return;
    }
    setLoadingClients(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, id_number, file_number, phone_number, less_than_24, under24_type, under24_driver_name, under24_driver_id, broker_id')
      .is('deleted_at', null)
      .or(`full_name.ilike.%${query}%,id_number.ilike.%${query}%,file_number.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(10);
    
    setLoadingClients(false);
    if (!error && data) {
      setClients(data as Client[]);
    }
  };

  useEffect(() => {
    if (clientSearch.length >= 2) {
      const timer = setTimeout(() => searchClients(clientSearch), 300);
      return () => clearTimeout(timer);
    } else {
      setClients([]);
    }
  }, [clientSearch]);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setCreateNewClient(false);
    setClientSearch("");
    setClients([]);
    setErrors({});
  };

  const handleCreateNewClick = () => {
    setSelectedClient(null);
    setCreateNewClient(true);
    setClientSearch("");
    setClients([]);
  };

  const handleCancelCreate = () => {
    setCreateNewClient(false);
    setNewClient({
      full_name: "",
      id_number: "",
      phone_number: "",
      phone_number_2: "",
      birth_date: "",
      under24_type: "none",
      under24_driver_name: "",
      under24_driver_id: "",
      notes: "",
    });
    setErrors({});
  };

  const handleRemoveClient = () => {
    setSelectedClient(null);
    setClientSearch("");
  };

  const FieldError = ({ error }: { error?: string }) => {
    if (!error) return null;
    return (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    );
  };

  return (
    <div className="space-y-6">
      {/* Branch Selection - Admin Only */}
      {isAdmin && branches.length > 1 && (
        <div>
          <Label className="text-base font-semibold mb-3 block">الفرع *</Label>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger className={cn(!selectedBranchId && "border-destructive")}>
              <SelectValue placeholder="اختر الفرع" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name_ar || branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Insurance Type Selection */}
      <div>
        <Label className="text-base font-semibold mb-3 block">نوع التأمين *</Label>
        <InsuranceTypeCards
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={onCategoryChange}
        />
        <FieldError error={errors.category} />
      </div>

      {/* Customer Section - Only shown after category is selected */}
      {selectedCategory && (
        <div className="space-y-4">
          <Label className="text-base font-semibold block">العميل *</Label>

          {/* Selected Client Card */}
          {selectedClient && !createNewClient && (
            <Card className="p-4 border-primary bg-primary/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedClient.full_name}</p>
                      <CheckCircle className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedClient.id_number}</p>
                    {selectedClient.phone_number && (
                      <p className="text-sm text-muted-foreground">{selectedClient.phone_number}</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleRemoveClient}>
                  تغيير
                </Button>
              </div>
            </Card>
          )}

          {/* Search or Create */}
          {!selectedClient && !createNewClient && (
            <div className="space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم، رقم الهوية، رقم الهاتف..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pr-10"
                />
              </div>

              {/* Search Results */}
              {loadingClients && (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}

              {!loadingClients && clients.length > 0 && (
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="w-full p-3 text-right hover:bg-muted/50 transition-colors flex items-center gap-3"
                      onClick={() => handleSelectClient(client)}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{client.full_name}</p>
                        <div className="flex gap-3 text-sm text-muted-foreground">
                          <span>{client.id_number}</span>
                          {client.phone_number && <span>{client.phone_number}</span>}
                        </div>
                      </div>
                      {client.file_number && (
                        <Badge variant="secondary">{client.file_number}</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {!loadingClients && clientSearch.length >= 2 && clients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  لم يتم العثور على نتائج
                </p>
              )}

              {/* Create New Client Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={handleCreateNewClick}
              >
                <Plus className="h-4 w-4" />
                إنشاء عميل جديد
              </Button>

              <FieldError error={errors.client} />
            </div>
          )}

          {/* Create New Client Form */}
          {createNewClient && (
            <div className="space-y-4">
              <CreateClientForm
                form={newClient}
                onChange={(field, value) => setNewClient({ ...newClient, [field]: value })}
                checkingDuplicate={checkingDuplicate}
                errors={errors}
              />
              <Button variant="outline" size="sm" onClick={handleCancelCreate} className="w-full">
                إلغاء
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
