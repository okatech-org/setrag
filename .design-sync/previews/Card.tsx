import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui"

export const Complete = () => (
  <div style={{ maxWidth: 420 }}>
    <Card>
      <CardHeader>
        <CardTitle>Owendo → Franceville</CardTitle>
        <CardDescription>Ligne principale · 648 km · environ 14 h de trajet</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-small text-ink-muted">
          Deux départs quotidiens, en classe économique, confort et VIP.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Rechercher une desserte</Button>
      </CardFooter>
    </Card>
  </div>
)
