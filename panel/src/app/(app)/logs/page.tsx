import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { LogsViewer } from "./logs-viewer";

export const metadata: Metadata = {
  title: "Logs",
};

export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Logs"
        description="Salida de PM2 del proceso ai-bot."
      />
      <div className="p-4 sm:p-6">
        <LogsViewer />
      </div>
    </>
  );
}
