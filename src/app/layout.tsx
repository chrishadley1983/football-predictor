import type { Metadata } from 'next'
import { Oswald, DM_Sans } from 'next/font/google'
import { Navbar } from '@/components/ui/Navbar'
import './globals.css'

const oswald = Oswald({
  variable: '--font-oswald',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
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
      <body className={`${oswald.variable} ${dmSans.variable} min-h-screen bg-background font-body text-foreground antialiased`}>
        {/* Subtle radial gradient overlay */}
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 30% 0%, rgba(26,92,58,0.35) 0%, transparent 60%),
                         radial-gradient(ellipse 50% 40% at 80% 90%, rgba(20,60,40,0.25) 0%, transparent 50%)`,
          }}
        />
        <div className="relative z-10">
          <Navbar />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
