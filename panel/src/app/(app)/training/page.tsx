import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { TrainingEditor } from "./training-editor";

export const metadata: Metadata = {
  title: "Entrenamiento",
};

export default function TrainingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Entrenamiento"
        description="Prompt de sistema del bot. Los cambios se aplican al siguiente mensaje entrante, sin reiniciar el proceso."
      />
      <PageBody>
        <TrainingEditor />
      </PageBody>
    </>
  );
}
