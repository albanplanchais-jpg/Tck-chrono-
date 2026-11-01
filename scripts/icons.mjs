// Génère les icônes PNG à partir d'un SVG (Playwright). Usage : npm run icons
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { writeFileSync } from 'node:fs'

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000"/>
  <g transform="translate(256 276) scale(${1 - pad})">
    <rect x="-34" y="-232" width="68" height="40" rx="10" fill="#fff"/>
    <circle r="180" fill="none" stroke="#fff" stroke-width="36"/>
    <circle r="112" fill="#fff"/>
  </g>
</svg>`
writeFileSync('public/icons/favicon.svg', svg(0.12))
const b = await chromium.launch()
const p = await b.newPage()
for (const [file, size, pad] of [['icon-192.png', 192, 0.12], ['icon-512.png', 512, 0.12], ['icon-maskable-512.png', 512, 0.3], ['apple-touch-icon.png', 180, 0.2]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`)
  await p.screenshot({ path: `public/icons/${file}` })
}
await b.close()
console.log('icons ok')
