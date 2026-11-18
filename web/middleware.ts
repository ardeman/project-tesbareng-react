/**
 * Bot-only rewrite: social crawlers get per-app Open Graph HTML instead of the SPA shell.
 * Humans still hit vercel.json → index.html.
 */
import { next, rewrite } from '@vercel/edge'

const BOT_UA =
  /bot|crawl|slurp|spider|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|SkypeUriPreview|Applebot|Google-InspectionTool|redditbot|Embedly|Quora Link Preview|Showyoubot|outbrain|pinterest|vkShare|W3C_Validator|flipboard|tumblr|bitlybot|nuzzel|Qwantify|pinterestbot|Bitlybot|xing-contenttabreceiver|Chrome-Lighthouse|Googlebot/i

const APP_PATH = /^\/apps\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i

export const config = {
  matcher: '/apps/:path*',
}

export default function middleware(request: Request) {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_UA.test(ua)) return next()

  const url = new URL(request.url)
  const m = url.pathname.match(APP_PATH)
  if (!m) return next()

  const target = new URL('/api/share/app', request.url)
  target.searchParams.set('id', m[1]!)
  return rewrite(target)
}
