import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  LANDING_DESC,
  LANDING_IMAGE,
  LANDING_TITLE,
  escapeHtml,
  isAppId,
  loadShareApp,
  originFrom,
  truncate,
} from '../lib/share'

export const config = { maxDuration: 5 }

function landingHtml(origin: string, canonical: string): string {
  const title = LANDING_TITLE
  const desc = LANDING_DESC
  const image = LANDING_IMAGE.startsWith('http') ? LANDING_IMAGE : `${origin}/og/landing.png`
  return shell({ title, desc, image, url: canonical })
}

function shell(o: { title: string; desc: string; image: string; url: string }): string {
  const t = escapeHtml(o.title)
  const d = escapeHtml(o.desc)
  const img = escapeHtml(o.image)
  const u = escapeHtml(o.url)
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<title>${t}</title>
<meta name="description" content="${d}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="TesBareng"/>
<meta property="og:locale" content="id_ID"/>
<meta property="og:url" content="${u}"/>
<meta property="og:title" content="${t}"/>
<meta property="og:description" content="${d}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="${t}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${t}"/>
<meta name="twitter:description" content="${d}"/>
<meta name="twitter:image" content="${img}"/>
<link rel="canonical" href="${u}"/>
<meta http-equiv="refresh" content="0;url=${u}"/>
</head>
<body>
<p><a href="${u}">${t}</a></p>
</body>
</html>`
}

function sendHtml(res: ServerResponse, body: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.statusCode = 200
  res.end(body)
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = originFrom(req.headers as Record<string, string | string[] | undefined>)
  const { searchParams } = new URL(req.url ?? '/', 'https://x')
  const id = searchParams.get('id')
  const canonical = isAppId(id) ? `${origin}/apps/${id}` : `${origin}/`

  if (!isAppId(id)) {
    sendHtml(res, landingHtml(origin, `${origin}/`))
    return
  }

  const app = await loadShareApp(id)
  if (!app) {
    sendHtml(res, landingHtml(origin, canonical))
    return
  }

  const title = `${app.name} · TesBareng`
  const desc =
    truncate(app.description, 200) ||
    (app.creator_name
      ? `${app.name} oleh ${app.creator_name} di TesBareng — komunitas creator Android Indonesia.`
      : `${app.name} di TesBareng — komunitas creator Android Indonesia.`)
  const image = `${origin}/api/og/app?id=${encodeURIComponent(app.id)}`

  sendHtml(res, shell({ title, desc, image, url: canonical }))
}
