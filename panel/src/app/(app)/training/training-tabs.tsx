"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { KnowledgeManager } from "./knowledge-manager";
import { TrainingEditor } from "./training-editor";

/**
 * Entrenamiento e Instrucciones eran dos páginas separadas y no debían serlo:
 * las dos responden a "qué sabe el bot", y tenerlas aparte obligaba a navegar
 * de una a otra para entender por qué respondió algo.
 *
 * La diferencia real es cuánto cambia cada cosa: las instrucciones definen la
 * personalidad y se tocan poco; el conocimiento son datos que cambian cada
 * semana. Por eso siguen siendo dos pestañas y no un mismo formulario.
 */
export function TrainingTabs() {
  const [tab, setTab] = useState("instructions");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="instructions">Instrucciones</TabsTrigger>
        <TabsTrigger value="knowledge">Conocimiento</TabsTrigger>
      </TabsList>

      <TabsContent value="instructions" className="mt-2">
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
          Quién es el bot, cómo habla y qué no debe hacer. Va entero en cada
          mensaje, así que conviene que sea corto y estable.
        </p>
        <TrainingEditor />
      </TabsContent>

      <TabsContent value="knowledge" className="mt-2">
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
          Datos que cambian: horarios, promociones, políticas. No van siempre en
          el prompt — el bot busca los que encajan con cada pregunta y solo
          inyecta esos.
        </p>
        <KnowledgeManager />
      </TabsContent>
    </Tabs>
  );
}
