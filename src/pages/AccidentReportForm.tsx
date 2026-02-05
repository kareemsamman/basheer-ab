import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertTriangle,
  ArrowRight,
  Save,
  Send,
  FileText,
  Download,
  Loader2,
  User,
  Car,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
  Building2,
  CheckCircle,
  Eye,
  Printer,
  MessageSquare,
  Clock,
  CalendarIcon,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ArabicDatePicker } from "@/components/ui/arabic-date-picker";
import { AccidentThirdPartyForm } from "@/components/accident-reports/AccidentThirdPartyForm";
 import { AccidentSignatureSection } from "@/components/accident-reports/AccidentSignatureSection";
 import { InjuredPersonsSection } from "@/components/accident-reports/InjuredPersonsSection";

interface Policy {
  id: string;
  policy_number: string | null;
  policy_type_parent: string;
  policy_type_child: string | null;
  start_date: string;
  end_date: string;
  cancelled: boolean | null;
  clients: {
    id: string;
    full_name: string;
    id_number: string;
    phone_number: string | null;
  };
  cars: {
    id: string;
    car_number: string;
    manufacturer_name: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    license_expiry: string | null;
  } | null;
  insurance_companies: {
    id: string;
    name: string;
    name_ar: string | null;
  } | null;
}

interface AccidentReport {
  id: string;
  policy_id: string;
  client_id: string;
  car_id: string | null;
  company_id: string | null;
  branch_id: string | null;
  status: string;
  accident_date: string;
  accident_time: string | null;
  accident_location: string | null;
  accident_description: string | null;
  driver_name: string | null;
  driver_id_number: string | null;
  driver_phone: string | null;
  driver_license_number: string | null;
  police_reported: boolean;
  police_station: string | null;
  police_report_number: string | null;
  croquis_url: string | null;
  generated_pdf_url: string | null;
  // New fields
  owner_address: string | null;
  driver_address: string | null;
  driver_age: number | null;
  driver_occupation: string | null;
  license_issue_place: string | null;
  license_expiry_date: string | null;
  first_license_date: string | null;
  vehicle_license_expiry: string | null;
  passengers_count: number | null;
  vehicle_usage_purpose: string | null;
  own_car_damages: string | null;
  was_anyone_injured: boolean | null;
  injuries_description: string | null;
  witnesses_info: string | null;
  passengers_info: string | null;
  responsible_party: string | null;
  additional_details: string | null;
   // New fields from migration
   owner_name: string | null;
   owner_phone: string | null;
   driver_license_grade: string | null;
   driver_license_issue_date: string | null;
   vehicle_chassis_number: string | null;
   vehicle_speed_at_accident: string | null;
   employee_notes: string | null;
   employee_signature_date: string | null;
   customer_signature_url: string | null;
   customer_signed_at: string | null;
}

interface ThirdParty {
  id: string;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  address: string | null;
  vehicle_number: string | null;
  vehicle_type: string | null;
  vehicle_manufacturer: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  damage_description: string | null;
  sort_order: number;
  isNew?: boolean;
}

interface AccidentNote {
  id: string;
  note: string;
  created_at: string;
  created_by: { full_name: string | null; email: string } | null;
}

interface AccidentReminder {
  id: string;
  reminder_date: string;
  reminder_text: string | null;
  is_done: boolean;
}

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  closed: "مُغلق",
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  submitted: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  closed: "bg-green-500/10 text-green-700 border-green-500/20",
};

export default function AccidentReportForm() {
  const { policyId, reportId } = useParams<{ policyId?: string; reportId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, branchId } = useAuth();

  // Resolved policyId (either from URL or fetched from report)
  const [resolvedPolicyId, setResolvedPolicyId] = useState<string | null>(policyId || null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [report, setReport] = useState<AccidentReport | null>(null);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);

  // Notes & Reminders state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reportNotes, setReportNotes] = useState<AccidentNote[]>([]);
  const [reminders, setReminders] = useState<AccidentReminder[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [hasActiveReminder, setHasActiveReminder] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [newReminderDate, setNewReminderDate] = useState<Date | undefined>();
  const [newReminderText, setNewReminderText] = useState("");
  const [addingReminder, setAddingReminder] = useState(false);
  // Form state - Accident details
  const [accidentDate, setAccidentDate] = useState("");
  const [accidentTime, setAccidentTime] = useState("");
  const [accidentLocation, setAccidentLocation] = useState("");
  const [accidentDescription, setAccidentDescription] = useState("");
  const [vehicleUsagePurpose, setVehicleUsagePurpose] = useState("");
  const [passengersCount, setPassengersCount] = useState<number | "">("");
  
  // Form state - Damages & Injuries
  const [ownCarDamages, setOwnCarDamages] = useState("");
  const [wasAnyoneInjured, setWasAnyoneInjured] = useState(false);
  const [injuriesDescription, setInjuriesDescription] = useState("");
  const [responsibleParty, setResponsibleParty] = useState("");
  
  // Form state - Owner/Driver
  const [ownerAddress, setOwnerAddress] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverAddress, setDriverAddress] = useState("");
  const [driverIdNumber, setDriverIdNumber] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverAge, setDriverAge] = useState<number | "">("");
  const [driverOccupation, setDriverOccupation] = useState("");
  const [driverLicenseNumber, setDriverLicenseNumber] = useState("");
  const [licenseIssuePlace, setLicenseIssuePlace] = useState("");
  const [licenseExpiryDate, setLicenseExpiryDate] = useState("");
  const [firstLicenseDate, setFirstLicenseDate] = useState("");
  const [vehicleLicenseExpiry, setVehicleLicenseExpiry] = useState("");
  
  // Form state - Police
  const [policeReported, setPoliceReported] = useState(false);
  const [policeStation, setPoliceStation] = useState("");
  const [policeReportNumber, setPoliceReportNumber] = useState("");
  
  // Form state - Additional
  const [witnessesInfo, setWitnessesInfo] = useState("");
  const [passengersInfo, setPassengersInfo] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");

   // New fields state
   const [ownerName, setOwnerName] = useState("");
   const [ownerPhone, setOwnerPhone] = useState("");
   const [driverLicenseGrade, setDriverLicenseGrade] = useState("");
   const [driverLicenseIssueDate, setDriverLicenseIssueDate] = useState("");
   const [vehicleChassisNumber, setVehicleChassisNumber] = useState("");
   const [vehicleSpeedAtAccident, setVehicleSpeedAtAccident] = useState("");
   const [employeeNotes, setEmployeeNotes] = useState("");
   const [employeeSignatureDate, setEmployeeSignatureDate] = useState("");
 
  const [activeTab, setActiveTab] = useState("accident");

  const fetchPolicyById = useCallback(async (pid: string) => {
    const { data, error } = await supabase
      .from("policies")
      .select(`
        id,
        policy_number,
        policy_type_parent,
        policy_type_child,
        start_date,
        end_date,
        cancelled,
        clients!inner(id, full_name, id_number, phone_number),
        cars(id, car_number, manufacturer_name, model, year, color, license_expiry),
        insurance_companies(id, name, name_ar)
      `)
      .eq("id", pid)
      .single();

    if (error) {
      console.error("Error fetching policy:", error);
      toast({ title: "خطأ", description: "فشل في تحميل بيانات الوثيقة", variant: "destructive" });
      return null;
    }

    return data as Policy;
  }, [toast]);

  const fetchReportById = useCallback(async (rid: string) => {
    const { data, error } = await supabase
      .from("accident_reports")
      .select("*")
      .eq("id", rid)
      .single();

    if (error) {
      console.error("Error fetching report:", error);
      toast({ title: "خطأ", description: "فشل في تحميل بلاغ الحادث", variant: "destructive" });
      return null;
    }

    return data;
  }, [toast]);

  const populateFormFromReport = (data: AccidentReport) => {
    setReport(data);
    setAccidentDate(data.accident_date || "");
    setAccidentTime(data.accident_time || "");
    setAccidentLocation(data.accident_location || "");
    setAccidentDescription(data.accident_description || "");
    setVehicleUsagePurpose(data.vehicle_usage_purpose || "");
    setPassengersCount(data.passengers_count ?? "");
    setOwnCarDamages(data.own_car_damages || "");
    setWasAnyoneInjured(data.was_anyone_injured || false);
    setInjuriesDescription(data.injuries_description || "");
    setResponsibleParty(data.responsible_party || "");
    setOwnerAddress(data.owner_address || "");
    setDriverName(data.driver_name || "");
    setDriverAddress(data.driver_address || "");
    setDriverIdNumber(data.driver_id_number || "");
    setDriverPhone(data.driver_phone || "");
    setDriverAge(data.driver_age ?? "");
    setDriverOccupation(data.driver_occupation || "");
    setDriverLicenseNumber(data.driver_license_number || "");
    setLicenseIssuePlace(data.license_issue_place || "");
    setLicenseExpiryDate(data.license_expiry_date || "");
    setFirstLicenseDate(data.first_license_date || "");
    setVehicleLicenseExpiry(data.vehicle_license_expiry || "");
    setPoliceReported(data.police_reported || false);
    setPoliceStation(data.police_station || "");
    setPoliceReportNumber(data.police_report_number || "");
    setWitnessesInfo(data.witnesses_info || "");
    setPassengersInfo(data.passengers_info || "");
    setAdditionalDetails(data.additional_details || "");
     // New fields
     setOwnerName(data.owner_name || "");
     setOwnerPhone(data.owner_phone || "");
     setDriverLicenseGrade(data.driver_license_grade || "");
     setDriverLicenseIssueDate(data.driver_license_issue_date || "");
     setVehicleChassisNumber(data.vehicle_chassis_number || "");
     setVehicleSpeedAtAccident(data.vehicle_speed_at_accident || "");
     setEmployeeNotes(data.employee_notes || "");
     setEmployeeSignatureDate(data.employee_signature_date || "");
  };

  const fetchThirdParties = async (rid: string) => {
    const { data: tpData } = await supabase
      .from("accident_third_parties")
      .select("*")
      .eq("accident_report_id", rid)
      .order("sort_order");
    if (tpData) setThirdParties(tpData);
  };

  const fetchNotesAndReminders = async (rid: string) => {
    // Fetch notes count
    const { count } = await supabase
      .from("accident_report_notes")
      .select("id", { count: "exact", head: true })
      .eq("accident_report_id", rid);
    setNotesCount(count || 0);

    // Fetch active reminders
    const { data: reminderData } = await supabase
      .from("accident_report_reminders")
      .select("id")
      .eq("accident_report_id", rid)
      .eq("is_done", false)
      .limit(1);
    setHasActiveReminder((reminderData?.length || 0) > 0);
  };

  // Handle status change
  const handleStatusChange = async (newStatus: string) => {
    if (!report) return;
    try {
      const { error } = await supabase
        .from("accident_reports")
        .update({ status: newStatus })
        .eq("id", report.id);
      if (error) throw error;
      setReport({ ...report, status: newStatus });
      toast({ title: "تم التحديث", description: "تم تحديث حالة البلاغ" });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "خطأ", description: "فشل في تحديث الحالة", variant: "destructive" });
    }
  };

  // Notes dialog functions
  const openNoteDialog = async () => {
    if (!report) return;
    setNoteDialogOpen(true);
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("accident_report_notes")
        .select(`id, note, created_at, created_by:profiles(full_name, email)`)
        .eq("accident_report_id", report.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReportNotes(data || []);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !report) return;
    setAddingNote(true);
    try {
      const { error } = await supabase
        .from("accident_report_notes")
        .insert({
          accident_report_id: report.id,
          note: newNote.trim(),
          created_by: profile?.id,
        });
      if (error) throw error;
      toast({ title: "تمت الإضافة", description: "تمت إضافة الملاحظة بنجاح" });
      setNewNote("");
      openNoteDialog();
      setNotesCount((prev) => prev + 1);
    } catch (error) {
      console.error("Error adding note:", error);
      toast({ title: "خطأ", description: "فشل في إضافة الملاحظة", variant: "destructive" });
    } finally {
      setAddingNote(false);
    }
  };

  // Reminder dialog functions
  const openReminderDialog = async () => {
    if (!report) return;
    setReminderDialogOpen(true);
    setLoadingReminders(true);
    try {
      const { data, error } = await supabase
        .from("accident_report_reminders")
        .select("id, reminder_date, reminder_text, is_done")
        .eq("accident_report_id", report.id)
        .order("reminder_date", { ascending: true });
      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error("Error fetching reminders:", error);
    } finally {
      setLoadingReminders(false);
    }
  };

  const handleAddReminder = async () => {
    if (!newReminderDate || !report) return;
    setAddingReminder(true);
    try {
      const { error } = await supabase
        .from("accident_report_reminders")
        .insert({
          accident_report_id: report.id,
          reminder_date: format(newReminderDate, "yyyy-MM-dd"),
          reminder_text: newReminderText.trim() || null,
          created_by: profile?.id,
        });
      if (error) throw error;
      toast({ title: "تم التعيين", description: "تم تعيين التذكير بنجاح" });
      setNewReminderDate(undefined);
      setNewReminderText("");
      openReminderDialog();
      setHasActiveReminder(true);
    } catch (error) {
      console.error("Error adding reminder:", error);
      toast({ title: "خطأ", description: "فشل في تعيين التذكير", variant: "destructive" });
    } finally {
      setAddingReminder(false);
    }
  };

  const handleToggleReminderDone = async (reminderId: string, isDone: boolean) => {
    try {
      const { error } = await supabase
        .from("accident_report_reminders")
        .update({ is_done: isDone })
        .eq("id", reminderId);
      if (error) throw error;
      openReminderDialog();
      // Check if there are still active reminders
      if (isDone && report) {
        fetchNotesAndReminders(report.id);
      }
    } catch (error) {
      console.error("Error toggling reminder:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      
      // Case 1: Direct access via /accidents/:reportId (no policyId in URL)
      if (reportId && reportId !== "new" && !policyId) {
        const reportData = await fetchReportById(reportId);
        if (reportData) {
          populateFormFromReport(reportData);
          setResolvedPolicyId(reportData.policy_id);
          const policyData = await fetchPolicyById(reportData.policy_id);
          if (policyData) {
            setPolicy(policyData);
          }
          await fetchThirdParties(reportId);
          await fetchNotesAndReminders(reportId);
        }
      }
      // Case 2: Access via /policies/:policyId/accident/:reportId
      else if (policyId) {
        const policyData = await fetchPolicyById(policyId);
        if (policyData) {
          setPolicy(policyData);
          // Pre-fill driver info for new reports
          if (!reportId || reportId === "new") {
            setDriverName(policyData.clients.full_name);
            setDriverIdNumber(policyData.clients.id_number);
            setDriverPhone(policyData.clients.phone_number || "");
            if (policyData.cars?.license_expiry) {
              setVehicleLicenseExpiry(policyData.cars.license_expiry);
            }
          }
        }
        
        // Fetch existing report if editing
        if (reportId && reportId !== "new") {
          const reportData = await fetchReportById(reportId);
          if (reportData) {
            populateFormFromReport(reportData);
            await fetchThirdParties(reportId);
            await fetchNotesAndReminders(reportId);
          }
        }
      }
      
      setLoading(false);
    };
    init();
  }, [policyId, reportId, fetchPolicyById, fetchReportById]);

  const handleSave = async () => {
    if (!policy) return;

    if (!accidentDate) {
      toast({ title: "خطأ", description: "تاريخ الحادث مطلوب", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const reportData = {
        policy_id: policy.id,
        client_id: policy.clients.id,
        car_id: policy.cars?.id || null,
        company_id: policy.insurance_companies?.id || null,
        branch_id: branchId || null,
        accident_date: accidentDate,
        accident_time: accidentTime || null,
        accident_location: accidentLocation || null,
        accident_description: accidentDescription || null,
        vehicle_usage_purpose: vehicleUsagePurpose || null,
        passengers_count: passengersCount || null,
        own_car_damages: ownCarDamages || null,
        was_anyone_injured: wasAnyoneInjured,
        injuries_description: injuriesDescription || null,
        responsible_party: responsibleParty || null,
        owner_address: ownerAddress || null,
        driver_name: driverName || null,
        driver_address: driverAddress || null,
        driver_id_number: driverIdNumber || null,
        driver_phone: driverPhone || null,
        driver_age: driverAge || null,
        driver_occupation: driverOccupation || null,
        driver_license_number: driverLicenseNumber || null,
        license_issue_place: licenseIssuePlace || null,
        license_expiry_date: licenseExpiryDate || null,
        first_license_date: firstLicenseDate || null,
        vehicle_license_expiry: vehicleLicenseExpiry || null,
        police_reported: policeReported,
        police_station: policeStation || null,
        police_report_number: policeReportNumber || null,
        witnesses_info: witnessesInfo || null,
        passengers_info: passengersInfo || null,
        additional_details: additionalDetails || null,
         // New fields
         owner_name: ownerName || null,
         owner_phone: ownerPhone || null,
         driver_license_grade: driverLicenseGrade || null,
         driver_license_issue_date: driverLicenseIssueDate || null,
         vehicle_chassis_number: vehicleChassisNumber || null,
         vehicle_speed_at_accident: vehicleSpeedAtAccident || null,
         employee_notes: employeeNotes || null,
         employee_signature_date: employeeSignatureDate || null,
      };

      let savedReportId = report?.id;

      if (report) {
        // Update existing
        const { error } = await supabase
          .from("accident_reports")
          .update(reportData)
          .eq("id", report.id);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("accident_reports")
          .insert({
            ...reportData,
            created_by_admin_id: profile?.id,
            status: "draft",
          })
          .select("id")
          .single();

        if (error) throw error;
        savedReportId = data.id;

        // Update URL to include report ID
        navigate(`/policies/${policyId}/accident/${savedReportId}`, { replace: true });
      }

      // Save third parties
      if (savedReportId) {
        // Delete removed third parties
        const existingIds = thirdParties.filter(tp => !tp.isNew).map(tp => tp.id);
        await supabase
          .from("accident_third_parties")
          .delete()
          .eq("accident_report_id", savedReportId)
          .not("id", "in", `(${existingIds.length > 0 ? existingIds.join(",") : "''"})`);

        // Upsert third parties
        for (let i = 0; i < thirdParties.length; i++) {
          const tp = thirdParties[i];
          const tpData = {
            accident_report_id: savedReportId,
            full_name: tp.full_name,
            id_number: tp.id_number,
            phone: tp.phone,
            address: tp.address,
            vehicle_number: tp.vehicle_number,
            vehicle_type: tp.vehicle_type,
            vehicle_manufacturer: tp.vehicle_manufacturer,
            vehicle_model: tp.vehicle_model,
            vehicle_year: tp.vehicle_year,
            vehicle_color: tp.vehicle_color,
            insurance_company: tp.insurance_company,
            insurance_policy_number: tp.insurance_policy_number,
            damage_description: tp.damage_description,
            sort_order: i,
          };

          if (tp.isNew) {
            const { data } = await supabase
              .from("accident_third_parties")
              .insert(tpData)
              .select("id")
              .single();
            if (data) {
              tp.id = data.id;
              tp.isNew = false;
            }
          } else {
            await supabase
              .from("accident_third_parties")
              .update(tpData)
              .eq("id", tp.id);
          }
        }
      }

      toast({ title: "تم الحفظ", description: "تم حفظ بلاغ الحادث بنجاح" });
      
      // Refresh data
      if (savedReportId) {
        const updatedReport = await fetchReportById(savedReportId);
        if (updatedReport) {
          setReport(updatedReport);
        }
      }
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast({ title: "خطأ", description: error.message || "فشل في حفظ البلاغ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!report) {
      toast({ title: "خطأ", description: "يجب حفظ البلاغ أولاً", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("accident_reports")
        .update({ status: "submitted" })
        .eq("id", report.id);

      if (error) throw error;

      toast({ title: "تم التقديم", description: "تم تقديم بلاغ الحادث بنجاح" });
      setReport({ ...report, status: "submitted" });
    } catch (error: any) {
      console.error("Error submitting report:", error);
      toast({ title: "خطأ", description: "فشل في تقديم البلاغ", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!report) {
      toast({ title: "خطأ", description: "يجب حفظ البلاغ أولاً", variant: "destructive" });
      return;
    }

    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-accident-pdf", {
        body: { accident_report_id: report.id },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({ title: "تم الإنشاء", description: "تم إنشاء ملف PDF بنجاح" });
      
      // Update report with new PDF URL
      const updatedReport = await fetchReportById(report.id);
      if (updatedReport) {
        setReport(updatedReport);
      }
      
      // Open the PDF in new tab for printing
      if (data?.pdf_url) {
        window.open(data.pdf_url, "_blank");
      }
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ 
        title: "خطأ", 
        description: error.message || "فشل في إنشاء ملف PDF", 
        variant: "destructive" 
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = () => {
    if (report?.generated_pdf_url) {
      // Add cache-busting parameter to bypass CDN cache and show latest edits
      const cacheBuster = `?cb=${Date.now()}`;
      window.open(report.generated_pdf_url + cacheBuster, "_blank");
    }
  };

  const addThirdParty = () => {
    setThirdParties([
      ...thirdParties,
      {
        id: crypto.randomUUID(),
        full_name: "",
        id_number: null,
        phone: null,
        address: null,
        vehicle_number: null,
        vehicle_type: null,
        vehicle_manufacturer: null,
        vehicle_model: null,
        vehicle_year: null,
        vehicle_color: null,
        insurance_company: null,
        insurance_policy_number: null,
        damage_description: null,
        sort_order: thirdParties.length,
        isNew: true,
      },
    ]);
  };

  const removeThirdParty = (id: string) => {
    setThirdParties(thirdParties.filter(tp => tp.id !== id));
  };

  const updateThirdParty = (id: string, updates: Partial<ThirdParty>) => {
    setThirdParties(thirdParties.map(tp => 
      tp.id === id ? { ...tp, ...updates } : tp
    ));
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6 p-6" dir="rtl">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!policy) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4" dir="rtl">
          <AlertTriangle className="h-16 w-16 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">لم يتم العثور على الوثيقة</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </MainLayout>
    );
  }

  // Check if policy type is eligible
  if (policy.policy_type_child !== "THIRD" && policy.policy_type_child !== "FULL") {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4" dir="rtl">
          <AlertTriangle className="h-16 w-16 text-amber-500" />
          <p className="text-lg text-muted-foreground">بلاغ الحادث متاح فقط لوثائق طرف ثالث وشامل</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                بلاغ حادث
              </h1>
              <p className="text-muted-foreground text-sm">
                وثيقة: {policy.policy_number || policy.id.slice(0, 8)} • 
                {policy.clients.full_name} • 
                {policy.cars?.car_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {report && (
              <>
                {/* Status Dropdown */}
                <Select value={report.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className={cn("w-[120px] h-9", statusColors[report.status])}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="submitted">مُقدَّم</SelectItem>
                    <SelectItem value="closed">مُغلق</SelectItem>
                  </SelectContent>
                </Select>

                {/* Notes Button */}
                <Button variant="outline" size="sm" onClick={openNoteDialog} className="gap-1">
                  <MessageSquare className="h-4 w-4" />
                  ملاحظات
                  {notesCount > 0 && (
                    <Badge variant="secondary" className="mr-1 px-1.5 py-0 text-xs">
                      {notesCount}
                    </Badge>
                  )}
                </Button>

                {/* Reminder Button */}
                <Button
                  variant={hasActiveReminder ? "default" : "outline"}
                  size="sm"
                  onClick={openReminderDialog}
                  className="gap-1"
                >
                  <Clock className={cn("h-4 w-4", hasActiveReminder && "animate-pulse")} />
                  تذكير
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Policy Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">العميل</p>
                <p className="font-medium flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {policy.clients.full_name}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">السيارة</p>
                <p className="font-medium flex items-center gap-1">
                  <Car className="h-4 w-4" />
                  {policy.cars?.car_number || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">الشركة</p>
                <p className="font-medium flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {policy.insurance_companies?.name_ar || policy.insurance_companies?.name || "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">نوع الوثيقة</p>
                <p className="font-medium">
                  {policy.policy_type_child === "THIRD" ? "طرف ثالث" : "شامل"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="accident" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              تفاصيل الحادث
            </TabsTrigger>
            <TabsTrigger value="driver" className="gap-2">
              <User className="h-4 w-4" />
              المالك / السائق
            </TabsTrigger>
            <TabsTrigger value="third-party" className="gap-2">
              <Users className="h-4 w-4" />
              الطرف الثالث
              {thirdParties.length > 0 && (
                <Badge variant="secondary" className="mr-1">{thirdParties.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="damages" className="gap-2">
              <Car className="h-4 w-4" />
              الأضرار والإصابات
            </TabsTrigger>
            <TabsTrigger value="attachments" className="gap-2">
              <FileText className="h-4 w-4" />
              المرفقات
            </TabsTrigger>
             <TabsTrigger value="injured" className="gap-2">
               <Users className="h-4 w-4" />
               المصابين
             </TabsTrigger>
             <TabsTrigger value="signature" className="gap-2">
               ✍️
               توقيع العميل
               {report?.customer_signature_url && (
                 <Badge variant="default" className="mr-1 bg-green-600 text-xs px-1">✓</Badge>
               )}
             </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(100vh-400px)] mt-4">
            {/* Accident Details Tab */}
            <TabsContent value="accident" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">تفاصيل الحادث</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>تاريخ الحادث *</Label>
                      <ArabicDatePicker
                        value={accidentDate}
                        onChange={(date) => setAccidentDate(date)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>وقت الحادث</Label>
                      <Input
                        type="time"
                        value={accidentTime}
                        onChange={(e) => setAccidentTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>عدد الركاب بالسيارة</Label>
                      <Input
                        type="number"
                        min="0"
                        value={passengersCount}
                        onChange={(e) => setPassengersCount(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="عدد الركاب"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>موقع الحادث</Label>
                      <div className="relative">
                        <MapPin className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={accidentLocation}
                          onChange={(e) => setAccidentLocation(e.target.value)}
                          className="pr-10"
                          placeholder="العنوان / الموقع بالتفصيل"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>الغرض من استعمال السيارة</Label>
                      <Input
                        value={vehicleUsagePurpose}
                        onChange={(e) => setVehicleUsagePurpose(e.target.value)}
                        placeholder="مثال: شخصي، تجاري، أجرة"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>كيف وقع الحادث (بالتفصيل)</Label>
                    <Textarea
                      value={accidentDescription}
                      onChange={(e) => setAccidentDescription(e.target.value)}
                      placeholder="وصف تفصيلي لظروف وملابسات الحادث..."
                      rows={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>من المسؤول عن الحادث (برأيك)</Label>
                    <Input
                      value={responsibleParty}
                      onChange={(e) => setResponsibleParty(e.target.value)}
                      placeholder="حدد المسؤول عن الحادث"
                    />
                  </div>

                  {/* Police Section */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <Label className="text-base font-medium">هل حققت الشرطة بالحادث؟</Label>
                      <Switch
                        checked={policeReported}
                        onCheckedChange={setPoliceReported}
                      />
                    </div>

                    {policeReported && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>مخفر الشرطة</Label>
                          <Input
                            value={policeStation}
                            onChange={(e) => setPoliceStation(e.target.value)}
                            placeholder="اسم المخفر"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>رقم المحضر</Label>
                          <Input
                            value={policeReportNumber}
                            onChange={(e) => setPoliceReportNumber(e.target.value)}
                            placeholder="رقم محضر الشرطة"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Driver/Owner Tab */}
            <TabsContent value="driver" className="space-y-4 m-0">
              {/* Owner Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">بيانات صاحب السيارة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>اسم المالك</Label>
                      <Input
                        value={policy.clients.full_name}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">يتم جلبه من بيانات العميل</p>
                    </div>
                    <div className="space-y-2">
                      <Label>عنوان المالك</Label>
                      <Input
                        value={ownerAddress}
                        onChange={(e) => setOwnerAddress(e.target.value)}
                        placeholder="العنوان بالتفصيل"
                      />
                    </div>
                     <div className="space-y-2">
                       <Label>اسم صاحب السيارة (إذا مختلف عن العميل)</Label>
                       <Input
                         value={ownerName}
                         onChange={(e) => setOwnerName(e.target.value)}
                         placeholder="اسم صاحب السيارة"
                       />
                     </div>
                     <div className="space-y-2">
                       <Label>رقم جوال صاحب السيارة</Label>
                       <div className="relative">
                         <Phone className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                         <Input
                           value={ownerPhone}
                           onChange={(e) => setOwnerPhone(e.target.value)}
                           className="pr-10"
                           placeholder="رقم الجوال"
                           dir="ltr"
                         />
                       </div>
                     </div>
                  </div>
                </CardContent>
              </Card>

              {/* Driver Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">بيانات السائق وقت الحادث</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>اسم السائق</Label>
                      <Input
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="اسم السائق"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>عنوان السائق</Label>
                      <Input
                        value={driverAddress}
                        onChange={(e) => setDriverAddress(e.target.value)}
                        placeholder="عنوان السائق"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>رقم الهوية</Label>
                      <Input
                        value={driverIdNumber}
                        onChange={(e) => setDriverIdNumber(e.target.value)}
                        placeholder="رقم الهوية"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>رقم الهاتف</Label>
                      <div className="relative">
                        <Phone className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(e.target.value)}
                          className="pr-10"
                          placeholder="رقم الهاتف"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>عمر السائق</Label>
                      <Input
                        type="number"
                        min="16"
                        max="100"
                        value={driverAge}
                        onChange={(e) => setDriverAge(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="العمر"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>مهنة السائق</Label>
                      <Input
                        value={driverOccupation}
                        onChange={(e) => setDriverOccupation(e.target.value)}
                        placeholder="المهنة"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium mb-4">بيانات رخصة القيادة</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>رقم رخصة السائق</Label>
                        <Input
                          value={driverLicenseNumber}
                          onChange={(e) => setDriverLicenseNumber(e.target.value)}
                          placeholder="رقم الرخصة"
                        />
                      </div>
                       <div className="space-y-2">
                         <Label>درجة رخصة السائق</Label>
                         <Input
                           value={driverLicenseGrade}
                           onChange={(e) => setDriverLicenseGrade(e.target.value)}
                           placeholder="مثال: B, C"
                         />
                       </div>
                      <div className="space-y-2">
                        <Label>مكان الصدور</Label>
                        <Input
                          value={licenseIssuePlace}
                          onChange={(e) => setLicenseIssuePlace(e.target.value)}
                          placeholder="مكان إصدار الرخصة"
                        />
                      </div>
                       <div className="space-y-2">
                         <Label>تاريخ إصدار الرخصة</Label>
                         <ArabicDatePicker
                           value={driverLicenseIssueDate}
                           onChange={(date) => setDriverLicenseIssueDate(date)}
                           isBirthDate
                         />
                       </div>
                      <div className="space-y-2">
                        <Label>تاريخ الانتهاء</Label>
                        <ArabicDatePicker
                          value={licenseExpiryDate}
                          onChange={(date) => setLicenseExpiryDate(date)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>تاريخ الحصول الأول على الرخصة</Label>
                        <ArabicDatePicker
                          value={firstLicenseDate}
                          onChange={(date) => setFirstLicenseDate(date)}
                          isBirthDate
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>تاريخ انتهاء رخصة المركبة</Label>
                        <ArabicDatePicker
                          value={vehicleLicenseExpiry}
                          onChange={(date) => setVehicleLicenseExpiry(date)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Third Party Tab */}
            <TabsContent value="third-party" className="space-y-4 m-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">بيانات الطرف الثالث</h3>
                <Button onClick={addThirdParty} size="sm">
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة طرف ثالث
                </Button>
              </div>

              {thirdParties.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لم يتم إضافة أطراف ثالثة بعد</p>
                    <Button onClick={addThirdParty} variant="outline" className="mt-4">
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة طرف ثالث
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {thirdParties.map((tp, index) => (
                    <AccidentThirdPartyForm
                      key={tp.id}
                      thirdParty={tp}
                      index={index}
                      onChange={(updates) => updateThirdParty(tp.id, updates)}
                      onRemove={() => removeThirdParty(tp.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Damages Tab */}
            <TabsContent value="damages" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">الأضرار التي لحقت بسيارتك من جراء الحادث (بالتفصيل)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={ownCarDamages}
                    onChange={(e) => setOwnCarDamages(e.target.value)}
                    placeholder="وصف تفصيلي للأضرار التي لحقت بسيارتك..."
                    rows={5}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">الإصابات الشخصية</CardTitle>
                    <Switch
                      checked={wasAnyoneInjured}
                      onCheckedChange={setWasAnyoneInjured}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">هل أصيب أحد من جراء الحادث؟</p>
                </CardHeader>
                {wasAnyoneInjured && (
                  <CardContent className="space-y-4">
                    <Label>تفاصيل الإصابات (اسم المصاب، عمره، عنوانه، طبيعة العمل، نوع الإصابة)</Label>
                    <Textarea
                      value={injuriesDescription}
                      onChange={(e) => setInjuriesDescription(e.target.value)}
                      placeholder="وصف تفصيلي للإصابات..."
                      rows={5}
                    />
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">الشهود والركاب</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>أسماء الشهود وعناوينهم</Label>
                    <Textarea
                      value={witnessesInfo}
                      onChange={(e) => setWitnessesInfo(e.target.value)}
                      placeholder="اذكر أسماء الشهود وعناوينهم (اذكر إذا كان الشهود ركاب أم لا)"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>أسماء الركاب وعناوينهم</Label>
                    <Textarea
                      value={passengersInfo}
                      onChange={(e) => setPassengersInfo(e.target.value)}
                      placeholder="اذكر أسماء الركاب وعناوينهم"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>تفاصيل إضافية</Label>
                    <Textarea
                      value={additionalDetails}
                      onChange={(e) => setAdditionalDetails(e.target.value)}
                      placeholder="أي تفاصيل إضافية تود ذكرها..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Attachments Tab */}
            <TabsContent value="attachments" className="space-y-4 m-0">
              <Card>
                <CardHeader>
                   <CardTitle className="text-lg">بيانات السيارة الإضافية</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>رقم الشاصي</Label>
                       <Input
                         value={vehicleChassisNumber}
                         onChange={(e) => setVehicleChassisNumber(e.target.value)}
                         placeholder="رقم الشاصي (الهيكل)"
                       />
                     </div>
                     <div className="space-y-2">
                       <Label>سرعة السيارة وقت الحادث</Label>
                       <Input
                         value={vehicleSpeedAtAccident}
                         onChange={(e) => setVehicleSpeedAtAccident(e.target.value)}
                         placeholder="مثال: 60 كم/ساعة"
                       />
                     </div>
                   </div>
                 </CardContent>
               </Card>
 
               <Card>
                 <CardHeader>
                   <CardTitle className="text-lg">ملاحظات الموظف</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="space-y-2">
                     <Label>ملاحظات الموظف</Label>
                     <Textarea
                       value={employeeNotes}
                       onChange={(e) => setEmployeeNotes(e.target.value)}
                       placeholder="ملاحظات الموظف على البلاغ..."
                       rows={4}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label>تاريخ توقيع الموظف</Label>
                     <ArabicDatePicker
                       value={employeeSignatureDate}
                       onChange={(date) => setEmployeeSignatureDate(date)}
                     />
                   </div>
                 </CardContent>
               </Card>
 
               <Card>
                 <CardHeader>
                   <CardTitle className="text-lg">ملف PDF</CardTitle>
                </CardHeader>
                <CardContent>
                  {report?.generated_pdf_url ? (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="font-medium">بلاغ الحادث (PDF)</p>
                          <p className="text-sm text-muted-foreground">تم الإنشاء</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadPdf}
                        >
                          <Eye className="h-4 w-4 ml-2" />
                          عرض / طباعة
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGeneratePdf}
                          disabled={generatingPdf}
                        >
                          {generatingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "إعادة الإنشاء"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>لم يتم إنشاء ملف PDF بعد</p>
                      <p className="text-sm">احفظ البلاغ ثم اضغط على "إنشاء PDF"</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
 
             {/* Injured Persons Tab */}
             <TabsContent value="injured" className="space-y-4 m-0">
               <InjuredPersonsSection reportId={report?.id || null} />
             </TabsContent>
 
             {/* Customer Signature Tab */}
             <TabsContent value="signature" className="space-y-4 m-0">
               {report ? (
                 <AccidentSignatureSection
                   reportId={report.id}
                   clientPhone={policy.clients.phone_number}
                   customerSignatureUrl={report.customer_signature_url || null}
                   customerSignedAt={report.customer_signed_at || null}
                   onSignatureUpdate={async () => {
                     if (report?.id) {
                       const updated = await fetchReportById(report.id);
                       if (updated) setReport(updated);
                     }
                   }}
                 />
               ) : (
                 <Card>
                   <CardContent className="p-8 text-center text-muted-foreground">
                     <p>يجب حفظ البلاغ أولاً لإرسال رابط التوقيع</p>
                   </CardContent>
                 </Card>
               )}
             </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            إلغاء
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ المسودة
            </Button>

            {report && (
              <>
                <Button
                  variant="outline"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Printer className="h-4 w-4 ml-2" />
                  )}
                  إنشاء PDF
                </Button>

                {report.status === "draft" && (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Send className="h-4 w-4 ml-2" />
                    )}
                    تقديم البلاغ
                  </Button>
                )}

                {report.status === "submitted" && (
                  <Badge className="bg-green-500/10 text-green-700 gap-1 py-2">
                    <CheckCircle className="h-4 w-4" />
                    تم التقديم
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* Notes Dialog */}
        <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>ملاحظات البلاغ</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {loadingNotes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : reportNotes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  لا توجد ملاحظات حتى الآن
                </p>
              ) : (
                reportNotes.map((note) => (
                  <div key={note.id} className="border-b pb-3 last:border-0">
                    <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{note.created_by?.full_name || note.created_by?.email || "مجهول"}</span>
                      <span className="ltr-nums">
                        {format(new Date(note.created_at), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-col gap-3">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="أضف ملاحظة جديدة..."
                rows={3}
              />
              <Button onClick={handleAddNote} disabled={addingNote || !newNote.trim()} className="w-full">
                {addingNote ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                إضافة ملاحظة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reminder Dialog */}
        <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>تذكيرات البلاغ</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Existing Reminders */}
              {loadingReminders ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : reminders.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  لا توجد تذكيرات
                </p>
              ) : (
                <div className="space-y-2">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        reminder.is_done ? "bg-muted/50 opacity-60" : "bg-background"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleToggleReminderDone(reminder.id, !reminder.is_done)}
                        >
                          {reminder.is_done ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </Button>
                        <div>
                          <p className={cn("text-sm font-medium ltr-nums", reminder.is_done && "line-through")}>
                            {format(new Date(reminder.reminder_date), "dd/MM/yyyy")}
                          </p>
                          {reminder.reminder_text && (
                            <p className="text-xs text-muted-foreground">{reminder.reminder_text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Reminder */}
              <div className="border-t pt-4 space-y-3">
                <Label>إضافة تذكير جديد</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {newReminderDate ? format(newReminderDate, "dd/MM/yyyy") : "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newReminderDate}
                      onSelect={setNewReminderDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  value={newReminderText}
                  onChange={(e) => setNewReminderText(e.target.value)}
                  placeholder="ملاحظة التذكير (اختياري)"
                />
                <Button
                  onClick={handleAddReminder}
                  disabled={addingReminder || !newReminderDate}
                  className="w-full"
                >
                  {addingReminder ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                  تعيين التذكير
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
