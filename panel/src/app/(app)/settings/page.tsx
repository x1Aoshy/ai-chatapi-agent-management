import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Ajustes",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Variables de entorno del bot y control del proceso."
      />
      <div className="p-4 sm:p-6">
        <SettingsForm />
      </div>
    </>
  );
}
