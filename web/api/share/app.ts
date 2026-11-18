import {
  LANDING_DESC,
  LANDING_IMAGE,
  LANDING_TITLE,
  escapeHtml,
  isAppId,
  loadShareApp,
  originFrom,
  truncate,
} from '../_lib/share'

export const config = { runtime: 'edge' }

function landingHtml(origin: string, canonical: string): Response {
  const title = LANDING_TITLE
  const desc = LANDING_DESC
  const image = LANDING_IMAGE.startsWith('http') ? LANDING_IMAGE : `${origin}/og/landing.png`
  return htmlResponse(shell({ title, desc, image, url: canonical }))
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

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const origin = originFrom(req)
  const id = new URL(req.url).searchParams.get('id')
  const canonical = isAppId(id) ? `${origin}/apps/${id}` : `${origin}/`

  if (!isAppId(id)) return landingHtml(origin, `${origin}/`)

  const app = await loadShareApp(id)
  if (!app) return landingHtml(origin, canonical)

  const title = `${app.name} · TesBareng`
  const desc =
    truncate(app.description, 200) ||
    (app.creator_name
      ? `${app.name} oleh ${app.creator_name} di TesBareng — komunitas creator Android Indonesia.`
      : `${app.name} di TesBareng — komunitas creator Android Indonesia.`)
  const image = `${origin}/api/og/app?id=${encodeURIComponent(app.id)}`

  return htmlResponse(shell({ title, desc, image, url: canonical }))
}
