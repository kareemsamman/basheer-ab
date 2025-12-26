import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Car, Plus, Search, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, CarRecord, NewCarForm, ValidationErrors } from "./types";
import { CAR_TYPES } from "./types";

interface Step2Props {
  selectedClient: Client | null;
  clientCars: CarRecord[];
  setClientCars: (cars: CarRecord[]) => void;
  loadingCars: boolean;
  setLoadingCars: (loading: boolean) => void;
  selectedCar: CarRecord | null;
  setSelectedCar: (car: CarRecord | null) => void;
  createNewCar: boolean;
  setCreateNewCar: (create: boolean) => void;
  newCar: NewCarForm;
  setNewCar: (car: NewCarForm) => void;
  existingCar: CarRecord | null;
  setExistingCar: (car: CarRecord | null) => void;
  carConflict: string | null;
  setCarConflict: (conflict: string | null) => void;
  fetchingCarData: boolean;
  setFetchingCarData: (fetching: boolean) => void;
  carDataFetched: boolean;
  setCarDataFetched: (fetched: boolean) => void;
  errors: ValidationErrors;
}

export function Step2Car({
  selectedClient,
  clientCars,
  setClientCars,
  loadingCars,
  setLoadingCars,
  selectedCar,
  setSelectedCar,
  createNewCar,
  setCreateNewCar,
  newCar,
  setNewCar,
  existingCar,
  setExistingCar,
  carConflict,
  setCarConflict,
  fetchingCarData,
  setFetchingCarData,
  carDataFetched,
  setCarDataFetched,
  errors,
}: Step2Props) {
  const { toast } = useToast();
  const [fetchingCarPrice, setFetchingCarPrice] = useState(false);

  // Fetch client cars
  useEffect(() => {
    if (selectedClient?.id) {
      fetchClientCars(selectedClient.id);
    }
  }, [selectedClient?.id]);

  const fetchClientCars = async (clientId: string) => {
    setLoadingCars(true);
    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null);
    
    setLoadingCars(false);
    if (!error && data) {
      setClientCars(data as CarRecord[]);
    }
  };

  // Check for existing car by car_number
  useEffect(() => {
    if (!createNewCar || !newCar.car_number || newCar.car_number.length < 5) {
      setExistingCar(null);
      setCarConflict(null);
      return;
    }
    
    const checkExistingCar = async () => {
      const { data } = await supabase
        .from('cars')
        .select('*, clients(full_name)')
        .eq('car_number', newCar.car_number)
        .is('deleted_at', null)
        .maybeSingle();
      
      if (data) {
        const clientId = selectedClient?.id;
        
        if (data.client_id === clientId) {
          setExistingCar(data as CarRecord);
          setCarConflict(null);
        } else {
          setExistingCar(null);
          setCarConflict(`هذه السيارة مسجلة على عميل آخر: ${(data as any).clients?.full_name || 'غير معروف'}`);
        }
      } else {
        setExistingCar(null);
        setCarConflict(null);
      }
    };
    
    const timer = setTimeout(checkExistingCar, 500);
    return () => clearTimeout(timer);
  }, [newCar.car_number, createNewCar, selectedClient?.id]);

  const fetchCarData = async () => {
    if (!newCar.car_number) {
      toast({ title: "خطأ", description: "الرجاء إدخال رقم السيارة", variant: "destructive" });
      return;
    }

    setFetchingCarData(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-vehicle', {
        body: { car_number: newCar.car_number }
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: "خطأ", description: data.error, variant: "destructive" });
        return;
      }

      const vehicleData = data.data || data;

      setNewCar({
        ...newCar,
        manufacturer_name: vehicleData.manufacturer_name || "",
        model: vehicleData.model || "",
        year: vehicleData.year?.toString() || "",
        color: vehicleData.color || "",
        license_expiry: vehicleData.license_expiry || "",
        car_type: vehicleData.car_type || "car",
      });
      setCarDataFetched(true);
      toast({ title: "تم جلب البيانات تلقائياً" });
    } catch {
      toast({ title: "خطأ", description: "لم يتم العثور على مركبة بهذا الرقم", variant: "destructive" });
    } finally {
      setFetchingCarData(false);
    }
  };

  const fetchCarPrice = async () => {
    if (!newCar.manufacturer_name || !newCar.year) {
      toast({ title: "خطأ", description: "الرجاء إدخال بيانات السيارة أولاً", variant: "destructive" });
      return;
    }

    setFetchingCarPrice(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-car-price', {
        body: { 
          manufacturer: newCar.manufacturer_name,
          model: newCar.model || '',
          year: parseInt(newCar.year)
        }
      });

      if (error) throw error;

      const priceData = data?.data || data;
      
      if (priceData?.price && priceData.price > 0) {
        setNewCar({ ...newCar, car_value: priceData.price.toString() });
        toast({ title: "تم جلب سعر السيارة", description: `₪ ${priceData.price.toLocaleString()}` });
      } else {
        toast({ title: "تنبيه", description: "لم يتم العثور على سعر لهذه السيارة" });
      }
    } catch {
      toast({ title: "خطأ", description: "فشل في جلب سعر السيارة", variant: "destructive" });
    } finally {
      setFetchingCarPrice(false);
    }
  };

  const handleSelectCar = (car: CarRecord) => {
    setSelectedCar(car);
    setCreateNewCar(false);
    setExistingCar(null);
    setCarConflict(null);
  };

  const handleCreateNewClick = () => {
    setSelectedCar(null);
    setCreateNewCar(true);
  };

  const handleCancelCreate = () => {
    setCreateNewCar(false);
    setNewCar({
      car_number: "",
      manufacturer_name: "",
      model: "",
      year: "",
      color: "",
      car_type: "car",
      car_value: "",
      license_expiry: "",
    });
    setExistingCar(null);
    setCarConflict(null);
    setCarDataFetched(false);
  };

  const handleRemoveCar = () => {
    setSelectedCar(null);
    setExistingCar(null);
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

  const getCarTypeLabel = (type: string | null) => {
    return CAR_TYPES.find(t => t.value === type)?.label || type || "غير محدد";
  };

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold block">السيارة *</Label>

      {/* Selected Car Display */}
      {(selectedCar || existingCar) && !createNewCar && (
        <Card className="p-4 border-primary bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium font-mono">{(selectedCar || existingCar)?.car_number}</p>
                  <CheckCircle className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {(selectedCar || existingCar)?.manufacturer_name} {(selectedCar || existingCar)?.model} {(selectedCar || existingCar)?.year}
                </p>
                {(selectedCar || existingCar)?.car_type && (
                  <Badge variant="secondary" className="mt-1">
                    {getCarTypeLabel((selectedCar || existingCar)?.car_type)}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRemoveCar}>
              تغيير
            </Button>
          </div>
        </Card>
      )}

      {/* Car Selection/Creation */}
      {!selectedCar && !existingCar && (
        <div className="space-y-4">
          {/* Client's Existing Cars */}
          {loadingCars ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : clientCars.length > 0 && !createNewCar ? (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">سيارات العميل</Label>
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {clientCars.map((car) => (
                  <button
                    key={car.id}
                    type="button"
                    className="w-full p-3 text-right hover:bg-muted/50 transition-colors flex items-center gap-3"
                    onClick={() => handleSelectCar(car)}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Car className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium font-mono">{car.car_number}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {car.manufacturer_name} {car.model} {car.year}
                      </p>
                    </div>
                    <Badge variant="secondary">{getCarTypeLabel(car.car_type)}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Create New Car */}
          {!createNewCar && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleCreateNewClick}
            >
              <Plus className="h-4 w-4" />
              إضافة سيارة جديدة
            </Button>
          )}

          <FieldError error={errors.car} />

          {/* New Car Form */}
          {createNewCar && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">سيارة جديدة</Label>
                <Button variant="ghost" size="sm" onClick={handleCancelCreate}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Car Number + Fetch */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>رقم السيارة *</Label>
                  <Input
                    value={newCar.car_number}
                    onChange={(e) => setNewCar({ ...newCar, car_number: e.target.value })}
                    placeholder="مثال: 1234567"
                    className={cn(errors.car_number || carConflict ? "border-destructive" : "")}
                  />
                  <FieldError error={errors.car_number || carConflict || undefined} />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="self-end"
                  onClick={fetchCarData}
                  disabled={fetchingCarData || !newCar.car_number}
                >
                  {fetchingCarData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  جلب
                </Button>
              </div>

              {/* Car Data Fetched Success */}
              {carDataFetched && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle className="h-4 w-4" />
                  تم جلب بيانات السيارة
                </div>
              )}

              {/* Car Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>الشركة المصنعة</Label>
                  <Input
                    value={newCar.manufacturer_name}
                    onChange={(e) => setNewCar({ ...newCar, manufacturer_name: e.target.value })}
                    placeholder="مثال: تويوتا"
                  />
                </div>
                <div>
                  <Label>الموديل</Label>
                  <Input
                    value={newCar.model}
                    onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                    placeholder="مثال: كورولا"
                  />
                </div>
                <div>
                  <Label>سنة الصنع</Label>
                  <Input
                    type="number"
                    value={newCar.year}
                    onChange={(e) => setNewCar({ ...newCar, year: e.target.value })}
                    placeholder="مثال: 2022"
                  />
                </div>
                <div>
                  <Label>اللون</Label>
                  <Input
                    value={newCar.color}
                    onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                    placeholder="مثال: أبيض"
                  />
                </div>
                <div>
                  <Label>نوع السيارة *</Label>
                  <Select value={newCar.car_type} onValueChange={(v) => setNewCar({ ...newCar, car_type: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>قيمة السيارة (₪)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={newCar.car_value}
                      onChange={(e) => setNewCar({ ...newCar, car_value: e.target.value })}
                      placeholder="القيمة"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchCarPrice}
                      disabled={fetchingCarPrice || !newCar.manufacturer_name || !newCar.year}
                    >
                      {fetchingCarPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : "جلب"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
