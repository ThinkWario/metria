import { redirect } from "next/navigation"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Metria | Redireccionando...",
  description: "Redireccionando al área de acceso de Metria Metrics.",
}

export default function Home() {
  redirect("/login")
}
