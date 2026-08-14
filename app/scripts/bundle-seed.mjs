// Concatenate ../seed/*.json into src/data/seed-deck.json so the app
// ships with the seed deck. /seed stays the single source of truth.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = join(here, '..', '..', 'seed')
const outDir = join(here, '..', 'src', 'data')
mkdirSync(outDir, { recursive: true })

const cards = []
const ids = new Set()
for (const f of readdirSync(seedDir).filter(f => f.endsWith('.json')).sort()) {
  for (const c of JSON.parse(readFileSync(join(seedDir, f), 'utf8'))) {
    if (ids.has(c.id)) throw new Error(`duplicate card id: ${c.id}`)
    ids.add(c.id)
    cards.push(c)
  }
}
writeFileSync(join(outDir, 'seed-deck.json'), JSON.stringify(cards))
console.log(`bundled ${cards.length} seed cards`)
