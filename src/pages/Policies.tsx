import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mockPolicies = [
  {
    id: "1",
    clientName: "أحمد محمد",
    carNumber: "12-345-67",
    policyType: "شامل",
    subType: "كامل",
    company: "مينورا",
    startDate: "2024-01-15",
    endDate: "2025-01-15",
    price: 2500,
    profit: 450,
    status: "active",
    paymentStatus: "paid",
  },
  {
    id: "2",
    clientName: "سارة أبو حسين",
    carNumber: "89-012-34",
    policyType: "إلزامي",
    subType: null,
    company: "هرئيل",
    startDate: "2024-02-20",
    endDate: "2025-02-20",
    price: 1200,
    profit: 0,
    status: "active",
    paymentStatus: "partial",
  },
  {
    id: "3",
    clientName: "محمد خالد",
    carNumber: "56-789-01",
    policyType: "خدمة طريق",
    subType: null,
    company: "فينيكس",
    startDate: "2024-03-10",
    endDate: "2025-03-10",
    price: 350,
    profit: 120,
    status: "active",
    paymentStatus: "unpaid",
  },
  {
    id: "4",
    clientName: "ليلى عمر",
    carNumber: "23-456-78",
    policyType: "شامل",
    subType: "طرف ثالث",
    company: "كلال",
    startDate: "2023-06-15",
    endDate: "2024-06-15",
    price: 1800,
    profit: 320,
    status: "expired",
    paymentStatus: "paid",
  },
  {
    id: "5",
    clientName: "خالد يوسف",
    carNumber: "90-123-45",
    policyType: "إعفاء حوادث",
    subType: null,
    company: "مينورا",
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    price: 600,
    profit: 200,
    status: "active",
    paymentStatus: "paid",
  },
];

const policyTypeColors: Record<string, string> = {
  "إلزامي": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "شامل": "bg-purple-500/10 text-purple-600 border-purple-500/20",
  "خدمة طريق": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "إعفاء حوادث": "bg-green-500/10 text-green-600 border-green-500/20",
};

const statusConfig = {
  active: { label: "نشطة", variant: "success" as const },
  expired: { label: "منتهية", variant: "destructive" as const },
  cancelled: { label: "ملغاة", variant: "secondary" as const },
};

const paymentConfig = {
  paid: { label: "مدفوع", variant: "success" as const },
  partial: { label: "جزئي", variant: "warning" as const },
  unpaid: { label: "غير مدفوع", variant: "destructive" as const },
};

export default function Policies() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPolicies = mockPolicies.filter(
    (policy) =>
      policy.clientName.includes(searchQuery) ||
      policy.carNumber.includes(searchQuery) ||
      policy.company.includes(searchQuery)
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG');
  };

  return (
    <MainLayout>
      <Header
        title="الوثائق"
        subtitle="إدارة وثائق التأمين"
        action={{ label: "وثيقة جديدة", onClick: () => {} }}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث في الوثائق..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  <TableHead className="text-muted-foreground font-medium">رقم السيارة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">النوع</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الشركة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الفترة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">السعر</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الربح</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الحالة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">الدفع</TableHead>
                  <TableHead className="text-muted-foreground font-medium w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPolicies.map((policy, index) => (
                  <TableRow
                    key={policy.id}
                    className={cn(
                      "border-border/30 transition-colors cursor-pointer",
                      "hover:bg-secondary/50 animate-fade-in"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <TableCell className="font-medium">{policy.clientName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground" dir="ltr">
                      {policy.carNumber}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("border", policyTypeColors[policy.policyType] || "bg-secondary")}>
                        {policy.policyType}
                        {policy.subType && ` (${policy.subType})`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{policy.company}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="text-foreground">{formatDate(policy.startDate)}</p>
                        <p className="text-muted-foreground">{formatDate(policy.endDate)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      ₪{policy.price.toLocaleString('ar-EG')}
                    </TableCell>
                    <TableCell className="font-medium text-success">
                      ₪{policy.profit.toLocaleString('ar-EG')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[policy.status as keyof typeof statusConfig].variant}>
                        {statusConfig[policy.status as keyof typeof statusConfig].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentConfig[policy.paymentStatus as keyof typeof paymentConfig].variant}>
                        {paymentConfig[policy.paymentStatus as keyof typeof paymentConfig].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              عرض {filteredPolicies.length} وثيقة
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">صفحة 1 من 1</span>
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
