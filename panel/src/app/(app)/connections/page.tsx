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
        description="Sesión de WhatsApp, servicios externos y memoria conversacional en Redis."
      />
      <PageBody>
        <ConnectionsContent />
      </PageBody>
    </>
  );
}
