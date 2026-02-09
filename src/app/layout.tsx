import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Navbar } from '@/components/ui/Navbar'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Football Prediction Game',
  description: 'Predict group stages and knockout brackets for major football tournaments. Compete with friends for prizes.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gray-50 font-sans antialiased dark:bg-gray-950`}>
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  )
}
