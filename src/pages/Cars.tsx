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
  Car as CarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mockCars = [
  {
    id: "1",
    carNumber: "12-345-67",
    ownerName: "أحمد محمد",
    manufacturer: "تويوتا",
    year: 2022,
    model: "كامري",
    licenseType: "خصوصي",
    color: "أبيض",
    carValue: 120000,
    licenseExpiry: "2025-03-15",
    activePolicies: 2,
  },
  {
    id: "2",
    carNumber: "89-012-34",
    ownerName: "سارة أبو حسين",
    manufacturer: "هيونداي",
    year: 2021,
    model: "توسان",
    licenseType: "خصوصي",
    color: "أسود",
    carValue: 95000,
    licenseExpiry: "2024-11-20",
    activePolicies: 1,
  },
  {
    id: "3",
    carNumber: "56-789-01",
    ownerName: "محمد خالد",
    manufacturer: "كيا",
    year: 2020,
    model: "سبورتاج",
    licenseType: "تجاري",
    color: "فضي",
    carValue: 85000,
    licenseExpiry: "2025-06-10",
    activePolicies: 3,
  },
  {
    id: "4",
    carNumber: "23-456-78",
    ownerName: "ليلى عمر",
    manufacturer: "مازدا",
    year: 2023,
    model: "CX-5",
    licenseType: "خصوصي",
    color: "أحمر",
    carValue: 145000,
    licenseExpiry: "2024-08-25",
    activePolicies: 1,
  },
  {
    id: "5",
    carNumber: "90-123-45",
    ownerName: "خالد يوسف",
    manufacturer: "فولكسفاجن",
    year: 2019,
    model: "جولف",
    licenseType: "خصوصي",
    color: "أزرق",
    carValue: 75000,
    licenseExpiry: "2025-01-30",
    activePolicies: 2,
  },
];

const licenseColors: Record<string, string> = {
  "خصوصي": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "تجاري": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "تاكسي": "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
};

export default function Cars() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredCars = mockCars.filter(
    (car) =>
      car.carNumber.includes(searchQuery) ||
      car.ownerName.includes(searchQuery) ||
      car.manufacturer.includes(searchQuery) ||
      car.model.includes(searchQuery)
  );

  const isExpiringSoon = (date: string) => {
    const expiry = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays > 0;
  };

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG');
  };

  return (
    <MainLayout>
      <Header
        title="السيارات"
        subtitle="إدارة قاعدة بيانات المركبات"
        action={{ label: "إضافة سيارة", onClick: () => {} }}
      />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث برقم السيارة، المالك، الشركة المصنعة..."
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
                  <TableHead className="text-muted-foreground font-medium">المركبة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">المالك</TableHead>
                  <TableHead className="text-muted-foreground font-medium">النوع</TableHead>
                  <TableHead className="text-muted-foreground font-medium">اللون</TableHead>
                  <TableHead className="text-muted-foreground font-medium">القيمة</TableHead>
                  <TableHead className="text-muted-foreground font-medium">انتهاء الرخصة</TableHead>
                  <TableHead className="text-muted-foreground font-medium text-center">الوثائق</TableHead>
                  <TableHead className="text-muted-foreground font-medium w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCars.map((car, index) => (
                  <TableRow
                    key={car.id}
                    className={cn(
                      "border-border/30 transition-colors cursor-pointer",
                      "hover:bg-secondary/50 animate-fade-in"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                          <CarIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-mono font-medium text-foreground" dir="ltr">{car.carNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {car.manufacturer} {car.model} {car.year}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{car.ownerName}</TableCell>
                    <TableCell>
                      <Badge className={cn("border", licenseColors[car.licenseType])}>
                        {car.licenseType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{car.color}</TableCell>
                    <TableCell className="font-medium">
                      ₪{car.carValue.toLocaleString('ar-EG')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          isExpired(car.licenseExpiry)
                            ? "destructive"
                            : isExpiringSoon(car.licenseExpiry)
                            ? "warning"
                            : "outline"
                        }
                      >
                        {formatDate(car.licenseExpiry)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{car.activePolicies}</Badge>
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
              عرض {filteredCars.length} مركبة
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
