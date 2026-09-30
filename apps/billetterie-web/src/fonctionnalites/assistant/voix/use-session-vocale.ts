"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useAction } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { cleInvite } from "../cle-invite"
import { useRuban, type IdConversation } from "../contexte-ruban"
import type { Carte } from "../types"
import { realtimeFunctionCallEvent, realtimeTranscriptEvent } from "./runtime"

export type EtatVocal = "inactif" | "connexion" | "ecoute" | "reflexion" | "parole" | "erreur"

const RAISONS: Record<string, string> = {
  disabled: "La conversation à voix haute n'est pas activée pour le moment.",
  not_configured: "La conversation à voix haute n'est pas encore configurée.",
  rate_limited: "Trop de conversations vocales d'affilée. Réessayez dans quelques minutes.",
}

/** Niveau sonore lissé (0 → 1) d'un flux audio : l'épaisseur du ruban suit la voix. */
function mesurerNiveau(flux: MediaStream, surNiveau: (n: number) => void): () => void {
  const Contexte = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Contexte) return () => {}
  const audio = new Contexte()
  const source = audio.createMediaStreamSource(flux)
  const analyseur = audio.createAnalyser()
  analyseur.fftSize = 512
  source.connect(analyseur)
  const donnees = new Uint8Array(analyseur.fftSize)
  let lisse = 0
  let image = 0
  const boucle = () => {
    analyseur.getByteTimeDomainData(donnees)
    let somme = 0
    for (const v of donnees) somme += ((v - 128) / 128) ** 2
    const rms = Math.sqrt(somme / donnees.length)
    // Lissage d'environ 80 ms : le ruban respire, il ne tremble pas.
    lisse = lisse * 0.8 + Math.min(1, rms * 4) * 0.2
    surNiveau(lisse)
    image = requestAnimationFrame(boucle)
  }
  boucle()
  return () => {
    cancelAnimationFrame(image)
    source.disconnect()
    void audio.close()
  }
}

/**
 * La conversation à voix haute avec Ruban (OpenAI Realtime, WebRTC).
 *
 * Le secret éphémère vient du backend (`mintVoiceToken`) ; chaque appel
 * d'outil reçu sur le DataChannel est exécuté par `executeVoiceTool`, avec le
 * même registre et les mêmes contrôles que le texte. Ce qui se dit s'écrit
 * aussi dans le fil, avec les cartes.
 */
export function useSessionVocale() {
  const ruban = useRuban()
  const obtenirJeton = useAction(api.ai.realtime.mintVoiceToken)
  const executerOutil = useAction(api.ai.realtime.executeVoiceTool)
  const majSession = useAction(api.ai.realtime.updateVoiceSession)

  const [etat, setEtat] = useState<EtatVocal>("inactif")
  const [niveau, setNiveau] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)
  const [micCoupe, setMicCoupe] = useState(false)
  const [transcriptionMoi, setTranscriptionMoi] = useState("")
  const [transcriptionRuban, setTranscriptionRuban] = useState("")

  const connexion = useRef<{
    pc: RTCPeerConnection
    canal: RTCDataChannel
    micro: MediaStream
    conversationId: IdConversation
    voiceSessionId: string
    arrets: (() => void)[]
  } | null>(null)
  const etatRef = useRef<EtatVocal>("inactif")
  const changer = (e: EtatVocal) => {
    etatRef.current = e
    setEtat(e)
  }
  /**
   * Chaque démarrage reçoit un numéro ; `arreter` l'invalide. Un démarrage
   * encore en vol (jeton, micro, négociation) qui découvre qu'on l'a arrêté
   * entre-temps — bouton « Terminer », fenêtre fermée — rend ce qu'il a pris
   * au lieu de rouvrir le micro derrière le dos du voyageur.
   */
  const tentative = useRef(0)

  const arreter = useCallback(
    async (statut: "ended" | "failed" = "ended") => {
      tentative.current += 1
      const c = connexion.current
      connexion.current = null
      setMicCoupe(false)
      if (!c) {
        changer("inactif")
        return
      }
      c.arrets.forEach((arret) => arret())
      c.micro.getTracks().forEach((piste) => piste.stop())
      c.canal.close()
      c.pc.close()
      setNiveau(0)
      setTranscriptionMoi("")
      setTranscriptionRuban("")
      changer("inactif")
      await majSession({ conversationId: c.conversationId, guestKey: cleInvite(), voiceSessionId: c.voiceSessionId as never, status: statut }).catch(() => {})
    },
    [majSession]
  )

  useEffect(() => () => void arreter(), [arreter])

  const demarrer = useCallback(async () => {
    if (connexion.current || etatRef.current === "connexion") return
    const numero = (tentative.current += 1)
    const abandonnee = () => tentative.current !== numero
    setErreur(null)
    changer("connexion")
    try {
      const conversationId = await ruban.assurerConversation()
      const grant = await obtenirJeton({ conversationId, guestKey: cleInvite() })
      if (abandonnee()) {
        if (grant.available)
          await majSession({ conversationId, guestKey: cleInvite(), voiceSessionId: grant.voiceSessionId as never, status: "ended" }).catch(() => {})
        return
      }
      if (!grant.available) {
        setErreur(RAISONS[grant.reason] ?? "La voix n'est pas disponible pour le moment.")
        changer("erreur")
        return
      }
      const micro = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (abandonnee()) {
        micro.getTracks().forEach((piste) => piste.stop())
        await majSession({ conversationId, guestKey: cleInvite(), voiceSessionId: grant.voiceSessionId as never, status: "ended" }).catch(() => {})
        return
      }
      const pc = new RTCPeerConnection()
      const sortie = new Audio()
      sortie.autoplay = true
      const arrets: (() => void)[] = []
      pc.ontrack = (event) => {
        const flux = event.streams[0]
        if (!flux || connexion.current?.pc !== pc) return
        sortie.srcObject = flux
        arrets.push(mesurerNiveau(flux, (n) => etatRef.current === "parole" && setNiveau(n)))
      }
      pc.addTrack(micro.getAudioTracks()[0]!, micro)
      arrets.push(mesurerNiveau(micro, (n) => etatRef.current === "ecoute" && setNiveau(n)))

      const canal = pc.createDataChannel("oai-events")
      // Tenue dès maintenant, et non après la négociation : si la suite échoue
      // ou si le voyageur arrête, `arreter` coupe le micro et ferme la
      // connexion. Sinon le micro resterait ouvert après « La connexion
      // vocale a échoué ».
      connexion.current = { pc, canal, micro, conversationId, voiceSessionId: grant.voiceSessionId, arrets }
      const envoyerEvenement = (evenement: unknown) => canal.readyState === "open" && canal.send(JSON.stringify(evenement))

      canal.addEventListener("message", (message) => {
        let evenement: unknown
        try {
          evenement = JSON.parse(String(message.data))
        } catch {
          return
        }
        const type = (evenement as { type?: string }).type
        if (type === "input_audio_buffer.speech_started") changer("ecoute")
        if (type === "input_audio_buffer.speech_stopped") changer("reflexion")
        if (type === "response.output_audio.delta" || type === "response.audio.delta" || type === "output_audio_buffer.started") changer("parole")
        if (type === "response.done" || type === "output_audio_buffer.stopped") {
          if (etatRef.current === "parole" || etatRef.current === "reflexion") changer("ecoute")
        }
        if (type === "error") setErreur("Ruban n'a pas compris. Reprenez votre phrase.")

        const transcription = realtimeTranscriptEvent(evenement)
        if (transcription) {
          if (transcription.role === "user") {
            setTranscriptionMoi("")
            ruban.ajouterEntree({ id: `voix-${transcription.id}`, role: "moi", texte: transcription.text, vocal: true, envoi: "ok" })
          } else if (transcription.mode === "delta") {
            setTranscriptionRuban((t) => t + transcription.text)
          } else {
            setTranscriptionRuban("")
            ruban.ajouterEntree({ id: `voix-${transcription.id}`, role: "ruban", texte: transcription.text, cartes: [], approbations: [], vocal: true })
          }
        }
        if (type === "conversation.item.input_audio_transcription.delta") {
          const delta = (evenement as { delta?: string }).delta
          if (delta) setTranscriptionMoi((t) => t + delta)
        }

        const appel = realtimeFunctionCallEvent(evenement)
        if (!appel) return
        changer("reflexion")
        void (async () => {
          const resultat = await executerOutil({
            conversationId,
            guestKey: cleInvite(),
            callId: appel.callId,
            name: appel.name,
            input: appel.input,
            voiceSessionId: grant.voiceSessionId as never,
          }).catch((cause: unknown) => ({ status: "error" as const, message: cause instanceof Error ? cause.message : "Échec de l'outil." }))

          // Ce que l'outil a produit s'affiche aussi dans le fil.
          const cartes: Carte[] = resultat.status === "ok" && "clientAction" in resultat && resultat.clientAction ? [{ type: resultat.clientAction, payload: resultat.output }] : []
          const approbations =
            resultat.status === "approval_required"
              ? [{ callId: resultat.callId, toolName: resultat.toolName, label: resultat.label, input: resultat.input, etat: "ouverte" as const }]
              : []
          if (cartes.length || approbations.length) {
            ruban.ajouterEntree({ id: `outil-${appel.callId}`, role: "ruban", texte: "", cartes, approbations, vocal: true })
          }
          envoyerEvenement({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: appel.callId, output: JSON.stringify(resultat) },
          })
          envoyerEvenement({ type: "response.create" })
        })()
      })

      const offre = await pc.createOffer()
      await pc.setLocalDescription(offre)
      const reponse = await fetch(grant.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${grant.token}`, "Content-Type": "application/sdp" },
        body: offre.sdp,
      })
      if (!reponse.ok) throw new Error(`Connexion vocale refusée (${reponse.status}).`)
      const sdp = await reponse.text()
      if (abandonnee()) return
      await pc.setRemoteDescription({ type: "answer", sdp })
      if (abandonnee()) return

      changer("ecoute")
      await majSession({ conversationId, guestKey: cleInvite(), voiceSessionId: grant.voiceSessionId as never, status: "connected" }).catch(() => {})
    } catch (cause) {
      // Arrêtée pendant la connexion : l'échec qui suit n'en est pas un.
      if (abandonnee()) return
      const refus = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
      setErreur(refus ? "Autorisez le micro pour parler à Ruban. Vous pouvez aussi lui écrire." : "La connexion vocale a échoué. Vous pouvez écrire à Ruban.")
      changer("erreur")
      await arreter("failed")
      changer("erreur")
    }
  }, [arreter, executerOutil, majSession, obtenirJeton, ruban])

  const basculerMicro = useCallback(() => {
    const micro = connexion.current?.micro
    if (!micro) return
    const coupe = !micCoupe
    micro.getAudioTracks().forEach((piste) => (piste.enabled = !coupe))
    setMicCoupe(coupe)
  }, [micCoupe])

  return { etat, niveau, erreur, micCoupe, transcriptionMoi, transcriptionRuban, demarrer, arreter, basculerMicro, actif: etat !== "inactif" && etat !== "erreur" }
}
