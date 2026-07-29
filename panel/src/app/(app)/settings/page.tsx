import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Ajustes",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Ajustes"
        description="Variables de entorno del bot y control del proceso que lo ejecuta."
      />
      <PageBody>
        <SettingsForm />
      </PageBody>
    </>
  );
}
