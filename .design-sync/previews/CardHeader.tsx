import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui"

/* CardHeader se lit dans sa carte : l'aperçu montre la composition complète. */
export const DansSaCarte = () => (
  <div style={{ maxWidth: 420 }}>
    <Card>
      <CardHeader>
        <CardTitle>Owendo → Franceville</CardTitle>
        <CardDescription>Ligne principale · 648 km</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-small text-ink-muted">Deux départs quotidiens.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Rechercher</Button>
      </CardFooter>
    </Card>
  </div>
)
