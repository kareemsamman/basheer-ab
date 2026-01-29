import { useState, useEffect } from "react";
import { Plus, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { digitsOnly, isValidIsraeliId } from "@/lib/validation";
import { ClientChild, NewChildForm, RELATION_OPTIONS, createEmptyChildForm } from "@/types/clientChildren";
import { supabase } from "@/integrations/supabase/client";

interface PolicyChildrenSelectorProps {
  clientId: string | null;
  selectedChildIds: string[];
  onSelectedChange: (ids: string[]) => void;
  newChildren: NewChildForm[];
  onNewChildrenChange: (children: NewChildForm[]) => void;
}

export function PolicyChildrenSelector({
  clientId,
  selectedChildIds,
  onSelectedChange,
  newChildren,
  onNewChildrenChange,
}: PolicyChildrenSelectorProps) {
  const [existingChildren, setExistingChildren] = useState<ClientChild[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  // Fetch existing children when client changes
  useEffect(() => {
    if (!clientId) {
      setExistingChildren([]);
      return;
    }

    const fetchChildren = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('client_children')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setExistingChildren(data || []);
      } catch (err) {
        console.error('Error fetching client children:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, [clientId]);

  const toggleChild = (childId: string) => {
    if (selectedChildIds.includes(childId)) {
      onSelectedChange(selectedChildIds.filter(id => id !== childId));
    } else {
      onSelectedChange([...selectedChildIds, childId]);
    }
  };

  const validateChild = (child: NewChildForm, allNewChildren: NewChildForm[]): Record<string, string> => {
    const childErrors: Record<string, string> = {};
    
    if (!child.full_name.trim()) {
      childErrors.full_name = "الاسم مطلوب";
    }
    
    if (!child.id_number.trim()) {
      childErrors.id_number = "رقم الهوية مطلوب";
    } else if (!isValidIsraeliId(child.id_number)) {
      childErrors.id_number = "رقم هوية غير صالح";
    } else {
      const normalized = digitsOnly(child.id_number).trim();

      // Check for duplicate ID within other new children
      const duplicateInNew = allNewChildren.some(
        c => c.id !== child.id && digitsOnly(c.id_number).trim() === normalized
      );
      
      // Check for duplicate ID within existing children
      const duplicateInExisting = existingChildren.some(
        c => digitsOnly(c.id_number).trim() === normalized
      );
      
      if (duplicateInNew) {
        childErrors.id_number = "رقم الهوية مكرر في القائمة";
      } else if (duplicateInExisting) {
        childErrors.id_number = "رقم الهوية موجود مسبقاً للعميل";
      }
    }
    
    return childErrors;
  };

  const handleAddChild = () => {
    onNewChildrenChange([...newChildren, createEmptyChildForm()]);
  };

  const handleUpdateChild = (index: number, field: keyof NewChildForm, value: string) => {
    const updated = [...newChildren];
    updated[index] = { ...updated[index], [field]: value };
    onNewChildrenChange(updated);

    // Recompute errors for all rows to keep duplicate validation in sync
    const nextErrors: Record<string, Record<string, string>> = {};
    for (const c of updated) {
      nextErrors[c.id] = validateChild(c, updated);
    }
    setErrors(nextErrors);
  };

  const handleRemoveNewChild = (index: number) => {
    const updated = newChildren.filter((_, i) => i !== index);
    onNewChildrenChange(updated);

    const nextErrors: Record<string, Record<string, string>> = {};
    for (const c of updated) {
      nextErrors[c.id] = validateChild(c, updated);
    }
    setErrors(nextErrors);
  };

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-xl border">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <User className="h-4 w-4" />
          السائقين الإضافيين / التابعين
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddChild}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          إضافة جديد
        </Button>
      </div>

      {/* Existing Children - Checkboxes */}
      {loading ? (
        <div className="text-sm text-muted-foreground">جاري التحميل...</div>
      ) : existingChildren.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">اختر من التابعين الموجودين:</Label>
          <div className="grid gap-2">
            {existingChildren.map((child) => (
              <label
                key={child.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  selectedChildIds.includes(child.id)
                    ? "bg-primary/10 border-primary"
                    : "bg-background hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={selectedChildIds.includes(child.id)}
                  onCheckedChange={() => toggleChild(child.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{child.full_name}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    <span className="font-mono">{child.id_number}</span>
                    {child.relation && <span>• {child.relation}</span>}
                  </div>
                </div>
                {selectedChildIds.includes(child.id) && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {/* New Children Forms */}
      {newChildren.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">تابعين جدد (سيتم إضافتهم للعميل):</Label>
          {newChildren.map((child, index) => {
            const childErrors = errors[child.id] || {};
            
            return (
              <div
                key={child.id}
                className="p-3 rounded-lg border bg-background space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    سائق جديد #{index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveNewChild(index)}
                  >
                    حذف
                  </Button>
                </div>
                
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      الاسم <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={child.full_name}
                      onChange={(e) => handleUpdateChild(index, 'full_name', e.target.value)}
                      placeholder="الاسم الكامل"
                      className={cn("h-9", childErrors.full_name && "border-destructive")}
                    />
                    {childErrors.full_name && (
                      <p className="text-xs text-destructive">{childErrors.full_name}</p>
                    )}
                  </div>
                  
                  {/* ID Number */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      رقم الهوية <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={child.id_number}
                      onChange={(e) => handleUpdateChild(index, 'id_number', digitsOnly(e.target.value).slice(0, 9))}
                      placeholder="9 أرقام"
                      maxLength={9}
                      className={cn("h-9 ltr-input", childErrors.id_number && "border-destructive")}
                    />
                    {childErrors.id_number && (
                      <p className="text-xs text-destructive">{childErrors.id_number}</p>
                    )}
                  </div>
                  
                  {/* Relation */}
                  <div className="space-y-1">
                    <Label className="text-xs">الصلة</Label>
                    <Select
                      value={child.relation}
                      onValueChange={(v) => handleUpdateChild(index, 'relation', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {existingChildren.length === 0 && newChildren.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground text-center py-2">
          لا يوجد تابعين لهذا العميل. اضغط "إضافة جديد" لإضافة سائق إضافي.
        </p>
      )}
    </div>
  );
}
