import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Dashboard"
        description="Estado de los servicios que sostienen el bot y del proceso que lo ejecuta."
      />
      <PageBody>
        <DashboardContent />
      </PageBody>
    </>
  );
}
