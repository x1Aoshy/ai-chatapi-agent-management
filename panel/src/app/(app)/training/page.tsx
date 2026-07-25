import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { TrainingTabs } from "./training-tabs";

export const metadata: Metadata = {
  title: "Entrenamiento",
};

export default function TrainingPage() {
  return (
    <>
      <PageHeader
        title="Entrenamiento"
        description="Lo que el bot sabe: su personalidad fija y el conocimiento que consulta según la pregunta."
      />
      <div className="p-4 sm:p-6">
        <TrainingTabs />
      </div>
    </>
  );
}
