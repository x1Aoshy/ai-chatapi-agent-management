import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { TrainingEditor } from "./training-editor";

export const metadata: Metadata = {
  title: "Entrenamiento",
};

export default function TrainingPage() {
  return (
    <>
      <PageHeader
        title="Entrenamiento"
        description="Prompt de sistema del bot. Los cambios se aplican al siguiente mensaje entrante, sin reiniciar."
      />
      <div className="p-6">
        <TrainingEditor />
      </div>
    </>
  );
}
