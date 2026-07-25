import { Skeleton } from "@workspace/ui"

export const Bloc = () => (
  <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
    <Skeleton className="h-8 w-40" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </div>
)
