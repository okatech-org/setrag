import { SkeletonLines } from "@workspace/ui"

export const Chargement = () => (
  <div style={{ maxWidth: 420 }}><SkeletonLines /></div>
)

export const Long = () => (
  <div style={{ maxWidth: 420 }}><SkeletonLines lines={5} /></div>
)
