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
      html.source = source
    },
  }
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
