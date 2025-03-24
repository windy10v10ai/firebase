import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '数字商品商店',
  description: '购买优质数字商品',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={inter.className}>
        <header className="bg-white shadow-sm">
          <nav className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <a href="/" className="text-xl font-bold">数字商品商店</a>
              <div className="space-x-4">
                <a href="/products" className="hover:text-blue-600">商品列表</a>
                <a href="/legal/disclosure" className="hover:text-blue-600">商业披露</a>
              </div>
            </div>
          </nav>
        </header>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-gray-50 border-t">
          <div className="container mx-auto px-4 py-8">
            <p className="text-center text-gray-600">© 2024 数字商品商店. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}