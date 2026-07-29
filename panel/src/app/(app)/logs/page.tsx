import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/page-header";

import { LogsViewer } from "./logs-viewer";

export const metadata: Metadata = {
  title: "Logs",
};

export default function LogsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Panel"
        title="Logs"
        description="Salida de PM2 del proceso ai-bot: stdout y stderr combinados."
      />
      <PageBody>
        <LogsViewer />
      </PageBody>
    </>
  );
}
