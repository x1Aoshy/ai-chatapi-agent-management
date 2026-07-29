import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { ConnectionsContent } from "./connections-content";

export const metadata: Metadata = {
  title: "Conexiones",
};

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Conexiones"
        description="Estado de los servicios externos y control de la sesión de WhatsApp."
      />
      <PageBody>
        <ConnectionsContent />
      </PageBody>
    </>
  );
}
