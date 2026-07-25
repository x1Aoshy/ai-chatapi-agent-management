import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { KnowledgeManager } from "./knowledge-manager";

export const metadata: Metadata = {
  title: "Conocimiento",
};

export default function KnowledgePage() {
  return (
    <>
      <PageHeader
        title="Conocimiento"
        description="Fragmentos que el bot busca por similitud e inyecta en su prompt según lo que pregunte el cliente."
      />
      <div className="p-6">
        <KnowledgeManager />
      </div>
    </>
  );
}
