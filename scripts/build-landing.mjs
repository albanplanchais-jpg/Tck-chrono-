/**
 * Construit le site vitrine (landing/, Next.js export statique) et le place à la racine de dist/ :
 *   /        → site vitrine (ce que trouvent les moteurs de recherche)
 *   /app     → l'application (app.html, construite par Vite juste avant)
 * Les fichiers de l'app ne sont jamais écrasés.
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'landing'
if (!existsSync(join(dir, 'package.json'))) { console.log('Pas de site vitrine : étape ignorée.'); process.exit(0) }
const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'inherit' })
const pnpm = 'npx -y pnpm@10.15.1'
run(`${pnpm} install --frozen-lockfile`)
run(`${pnpm} build`)

const copy = (from, to) => {
  for (const name of readdirSync(from)) {
    const src = join(from, name), dst = join(to, name)
    if (statSync(src).isDirectory()) { cpSync(src, dst, { recursive: true, force: false, errorOnExist: false }); continue }
    if (existsSync(dst)) { console.log(`  (gardé : ${dst} de l'app)`); continue }
    cpSync(src, dst)
  }
}
copy(join(dir, 'out'), 'dist')
console.log('Site vitrine copié à la racine de dist/.')
