import { ImageResponse } from '@vercel/og'
import {
  STATUS_LABEL,
  fetchPlayOgImage,
  isAppId,
  loadShareApp,
  monogram,
  storeListingUrl,
  truncate,
} from '../lib/share'

export const config = { runtime: 'edge' }

const KERTAS = '#FFF6E3'
const PUTIH = '#FFFFFF'
const INK = '#121212'
const KUNYIT = '#FFC83D'
const PANDAN = '#2FD47E'
const LANGIT = '#6BB8FF'

function statusFill(status: string): string {
  if (status === 'live' || status === 'applied') return PANDAN
  if (status === 'testing') return LANGIT
  return KUNYIT
}

export default async function handler(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id')
  if (!isAppId(id)) {
    return new Response('Not found', { status: 404 })
  }

  const app = await loadShareApp(id)
  if (!app) {
    return new Response('Not found', { status: 404 })
  }

  const listing = storeListingUrl(app)
  const iconUrl = listing ? await fetchPlayOgImage(listing) : null
  const label = STATUS_LABEL[app.status] ?? app.status
  const fill = statusFill(app.status)
  const desc = truncate(app.description, 120)
  const letters = monogram(app.name)

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: KERTAS,
          backgroundImage:
            'linear-gradient(#1212120D 1px, transparent 1px), linear-gradient(90deg, #1212120D 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          padding: '48px 56px',
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          color: INK,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 28,
                height: 28,
                backgroundColor: KUNYIT,
                border: `3px solid ${INK}`,
                boxShadow: `4px 4px 0 ${INK}`,
              }}
            />
            <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>TesBareng</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              backgroundColor: fill,
              border: `3px solid ${INK}`,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            {label}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 40,
            alignItems: 'center',
            backgroundColor: PUTIH,
            border: `4px solid ${INK}`,
            boxShadow: `10px 10px 0 ${INK}`,
            padding: '40px 44px',
          }}
        >
          <div
            style={{
              width: 168,
              height: 168,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: iconUrl ? PUTIH : KUNYIT,
              border: `4px solid ${INK}`,
              boxShadow: `6px 6px 0 ${INK}`,
              overflow: 'hidden',
              fontSize: 56,
              fontWeight: 900,
            }}
          >
            {iconUrl ? (
              <img src={iconUrl} width={168} height={168} style={{ objectFit: 'cover' }} />
            ) : (
              letters
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 56,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                display: 'block',
                maxHeight: 140,
                overflow: 'hidden',
              }}
            >
              {app.name}
            </div>
            {desc ? (
              <div style={{ fontSize: 28, lineHeight: 1.35, color: '#57534B', display: 'block' }}>{desc}</div>
            ) : null}
            {app.creator_name ? (
              <div style={{ fontSize: 24, fontWeight: 700, display: 'block' }}>oleh {app.creator_name}</div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 22,
            fontWeight: 700,
            color: '#57534B',
          }}
        >
          Buka di TesBareng · saling ngetes app Android
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )

  return image
}
