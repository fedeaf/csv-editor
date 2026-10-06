import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'

/** Inlines the built JS and CSS into index.html so the result is one file that works from file://. */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
      if (!html || html.type !== 'asset') return
      let source = String(html.source)
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script')
          source = source
            .replace(new RegExp(`<script[^>]*src="[^"]*${escapeRe(name)}"[^>]*></script>`), () => '')
            .replace('</body>', () => `<script type="module">\n${code}\n</script>\n</body>`)
          delete bundle[name]
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`),
            () => `<style>\n${file.source}\n</style>`,
          )
          delete bundle[name]
        }
      }
      html.source = addPolicy(source)
    },
  }
}

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`

/**
 * The page promises that nothing leaves the computer, and this makes the browser hold it to that: with a
 * Content-Security-Policy that allows no connection of any kind (no fetch, XHR, WebSocket, beacon, frame,
 * worker, font or remote image), any code that tried one, ours or a library's, would be refused. The only
 * script and style allowed are the two inline blocks of this file, by their hash, so nothing else can be
 * injected either. Only the production build gets it: the development server needs its own socket.
 */
function addPolicy(source: string): string {
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(source)?.[1]
  const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1]
  if (script === undefined || style === undefined) throw new Error('Expected one inline script and one inline style to put a policy on.')
  const policy = [
    "default-src 'none'",
    `script-src ${sha256(script)}`,
    `style-src ${sha256(style)}`,
    'img-src data:', // the icon of the tab is a data: URI
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
  return source.replace('<meta charset="UTF-8" />', () => `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default defineConfig({
  base: './',
  plugins: [singleFile()],
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
    modulePreload: false,
    // The editor is for current Chrome only, so the CSS can use light-dark() as written. With an older
    // target the minifier rewrites it into a media-query trick that would be less robust.
    cssTarget: 'chrome123',
  },
})
