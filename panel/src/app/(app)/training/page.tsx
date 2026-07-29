import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { TrainingTabs } from "./training-tabs";

export const metadata: Metadata = {
  title: "Entrenamiento",
};

export default function TrainingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Entrenamiento"
        description="Lo que el bot sabe: su personalidad fija y el conocimiento que consulta según la pregunta."
      />
      <PageBody>
        <TrainingTabs />
      </PageBody>
    </>
  );
}
