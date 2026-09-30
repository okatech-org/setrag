import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface GareLigne {
  nom: string
  km: number
  /** Gare nommée sur le schéma ; les autres sont des points. */
  majeure?: boolean
}

export interface TrainLigne {
  km: number
  libelle: string
  etat?: "ok" | "retard" | "annule"
  /** Sens de marche : la tête bleue du ruban pointe vers la destination. */
  sens: "aller" | "retour"
}

export interface SchemaLigneProps extends Omit<React.ComponentProps<"svg">, "children"> {
  gares: GareLigne[]
  /** Trajet choisi [km départ, km arrivée] : le ruban s'y pose. */
  segment?: [number, number]
  /** Trains en circulation : chacun est une rame de ruban. */
  trains?: TrainLigne[]
}

const W = 1000
const Y = 58

/**
 * La ligne du Transgabonais, gares placées à leur point kilométrique réel.
 * L'illustration de l'accueil, l'outil du suivi : c'est le réseau lui-même.
 */
export function SchemaLigne({ gares, segment, trains = [], className, ...props }: SchemaLigneProps) {
  const id = `sl${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  if (gares.length < 2) return null
  const longueur = Math.max(...gares.map((g) => g.km))
  const x = (km: number) => 30 + (km / longueur) * (W - 60)
  const [de, a] = segment ?? [0, 0]
  const majeures = gares.filter((g) => g.majeure || g.km === 0 || g.km === longueur || (segment && (g.km === de || g.km === a)))
  const couleurEtat = { ok: "var(--c-success-ink)", retard: "var(--c-warning-ink)", annule: "var(--c-danger-ink)" }

  return (
    <svg
      viewBox={`0 0 ${W} 124`}
      role="img"
      aria-label={`Ligne du Transgabonais, de ${gares[0]!.nom} à ${gares.at(-1)!.nom}`}
      className={cn("block h-auto w-full overflow-visible", className)}
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-seg`} gradientUnits="userSpaceOnUse" x1={x(de)} y1={0} x2={x(a)} y2={0}>
          <stop offset="0" stopColor="#029E60" />
          <stop offset=".5" stopColor="#FCDF49" />
          <stop offset=".75" stopColor="#00A6A0" />
          <stop offset="1" stopColor="var(--c-accent)" />
        </linearGradient>
        {trains.map((t, i) => (
          <linearGradient key={i} id={`${id}-t${i}`} x1={t.sens === "aller" ? 0 : 1} x2={t.sens === "aller" ? 1 : 0}>
            <stop offset="0" stopColor="#029E60" />
            <stop offset=".5" stopColor="#FCDF49" />
            <stop offset="1" stopColor="#0F50A0" />
          </linearGradient>
        ))}
      </defs>
      {/* La voie : rails et traverses, neutres. */}
      <line x1={x(0)} y1={Y - 4} x2={x(longueur)} y2={Y - 4} stroke="var(--c-line-strong)" strokeWidth={1.5} />
      <line x1={x(0)} y1={Y + 4} x2={x(longueur)} y2={Y + 4} stroke="var(--c-line-strong)" strokeWidth={1.5} />
      <line x1={x(0)} y1={Y} x2={x(longueur)} y2={Y} stroke="var(--c-line)" strokeWidth={13} strokeDasharray="2 6" />
      {segment && <line x1={x(de)} y1={Y} x2={x(a)} y2={Y} stroke={`url(#${id}-seg)`} strokeWidth={7} strokeLinecap="round" />}
      {gares.map((gare) => {
        const dans = segment ? gare.km >= Math.min(de, a) && gare.km <= Math.max(de, a) : false
        const nommee = majeures.includes(gare)
        return (
          <circle
            key={gare.nom}
            cx={x(gare.km)}
            cy={Y}
            r={nommee ? 7.5 : 2.6}
            fill="var(--c-surface)"
            stroke={dans ? "var(--c-accent)" : "var(--c-line-strong)"}
            strokeWidth={nommee ? 3 : 1.5}
          >
            <title>{`${gare.nom} · PK ${gare.km}`}</title>
          </circle>
        )
      })}
      {majeures.map((gare, i) => {
        const haut = i % 2 === 0
        // Les terminus s'alignent sur les bords : le nom ne sort pas du cadre.
        const ancre = gare.km === 0 ? "start" : gare.km === longueur ? "end" : "middle"
        const xt = x(gare.km) + (gare.km === 0 ? -8 : gare.km === longueur ? 8 : 0)
        return (
          <g key={gare.nom} textAnchor={ancre}>
            <text x={xt} y={haut ? 30 : 96} style={{ font: "600 14px var(--font-ui)", fill: "var(--c-ink)" }}>
              {gare.nom}
            </text>
            <text x={xt} y={haut ? 14 : 113} style={{ font: "500 11.5px var(--font-mono)", fill: "var(--c-ink-muted)" }}>
              PK {gare.km}
            </text>
          </g>
        )
      })}
      {trains.map((t, i) => (
        <g key={i}>
          <rect x={x(t.km) - 22} y={Y - 5} width={44} height={10} rx={5} fill={`url(#${id}-t${i})`} stroke="var(--c-surface)" strokeWidth={2} />
          <text x={x(t.km)} y={Y - 16} textAnchor="middle" style={{ font: "600 12px var(--font-mono)", fill: couleurEtat[t.etat ?? "ok"] }}>
            {t.libelle}
          </text>
        </g>
      ))}
    </svg>
  )
}
