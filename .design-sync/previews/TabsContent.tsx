import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui"

/* TabsContent ne rend que dans son Tabs : l'aperçu montre la composition complète. */
export const DansSesOnglets = () => (
  <div style={{ maxWidth: 520 }}>
    <Tabs defaultValue="aller">
      <TabsList>
        <TabsTrigger value="aller">Aller</TabsTrigger>
        <TabsTrigger value="retour">Retour</TabsTrigger>
      </TabsList>
      <TabsContent value="aller">
        <p className="text-small text-ink-muted">4 dessertes le vendredi 7 août.</p>
      </TabsContent>
      <TabsContent value="retour">
        <p className="text-small text-ink-muted">3 dessertes le dimanche 9 août.</p>
      </TabsContent>
    </Tabs>
  </div>
)
