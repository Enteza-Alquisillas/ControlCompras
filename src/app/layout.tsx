import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Enteza Reservas App',
  description: 'Gestión profesional de reservas y disponibilidad',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
