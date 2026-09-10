import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './vault.css';
import './workflows.css';
import './redesign.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PokéLib · Your competitive playbook',
  description:
    'Store, search, annotate, version and share your competitive Pokémon teams.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="source-offer">
          <a href="/source/pokelib-source.tar" download>
            PokéLib source · AGPLv3
          </a>
          <span>Builder adapted from Pokémon Showdown</span>
        </footer>
      </body>
    </html>
  );
}
