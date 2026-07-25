import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui"

export const AllerRetour = () => (
  <div style={{ maxWidth: 520 }}>
    <Tabs defaultValue="aller">
      <TabsList>
        <TabsTrigger value="aller">Aller</TabsTrigger>
        <TabsTrigger value="retour">Retour</TabsTrigger>
        <TabsTrigger value="options">Options</TabsTrigger>
      </TabsList>
      <TabsContent value="aller">
        <p className="text-small text-ink-muted">4 dessertes le vendredi 7 août, à partir de 18 000 F.</p>
      </TabsContent>
      <TabsContent value="retour">
        <p className="text-small text-ink-muted">3 dessertes le dimanche 9 août.</p>
      </TabsContent>
      <TabsContent value="options">
        <p className="text-small text-ink-muted">Bagage volumineux, voiture calme, repas à bord.</p>
      </TabsContent>
    </Tabs>
  </div>
)
