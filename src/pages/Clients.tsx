import { MainLayout } from "@/components/layout/MainLayout";
import { Header } from "@/components/layout/Header";
import { ClientsTable } from "@/components/clients/ClientsTable";

export default function Clients() {
  return (
    <MainLayout>
      <Header
        title="العملاء"
        subtitle="إدارة قاعدة بيانات العملاء"
        action={{ label: "إضافة عميل", onClick: () => {} }}
      />

      <div className="p-6">
        <ClientsTable />
      </div>
    </MainLayout>
  );
}
