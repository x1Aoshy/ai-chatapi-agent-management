import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Estado de los servicios que sostienen el bot."
      />
      <div className="p-4 sm:p-6">
        <DashboardContent />
      </div>
    </>
  );
}
