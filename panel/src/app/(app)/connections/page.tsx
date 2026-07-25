import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { ConnectionsContent } from "./connections-content";

export const metadata: Metadata = {
  title: "Conexiones",
};

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Conexiones"
        description="Estado de los servicios externos y control de la sesión de WhatsApp."
      />
      <div className="p-6">
        <ConnectionsContent />
      </div>
    </>
  );
}
