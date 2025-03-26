import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DOTA2 10v10 AI',
  description: 'DOTA2 10v10 AI custom map',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={`${inter.className} min-h-screen bg-gray-900`}>
        <div className="fixed inset-0 bg-[url('/images/dota-bg.jpg')] bg-cover bg-center opacity-50 z-0"></div>
        <div className="relative z-10">
          <header className="card-container shadow-lg border-b border-gray-700">
            <nav className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <a href="/" className="text-xl font-bold text-white link-hover">Windy10v10ai</a>
                <div className="space-x-4">
                  {/* <a href="/products" className="text-content link-hover">商品列表</a> */}
                  <a href="/legal/disclosure" className="text-content link-hover">商业披露</a>
                </div>
              </div>
            </nav>
          </header>
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="card-container border-t border-gray-700">
            <div className="container mx-auto px-4 py-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="flex space-x-4">
                  <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=2307479570" target="_blank" rel="noopener noreferrer" className="text-content link-hover">Steam Workshop</a>
                  <a href="https://github.com/windy10v10ai/game" target="_blank" rel="noopener noreferrer" className="text-content link-hover">GitHub</a>
                </div>
                <p className="text-content">© 2025 Windy10v10ai. All rights reserved.</p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}