#!/usr/bin/env node
/**
 * Send a newsletter to all subscribers.
 *
 * Usage:
 *   node scripts/send-newsletter.mjs path/to/newsletter.txt
 *
 * Reads newsletter body from a text file, prompts for subject, shows a preview,
 * offers test-send-to-self first, then sends to all subscribers after confirmation.
 *
 * Requires NEWSLETTER_SECRET and API endpoint (from api/.env).
 */

import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ── Load .env manually (lightweight, no dotenv dependency) ────────────────

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const apiEnv = loadEnvFile(path.join(root, 'api', '.env'))
const secret = apiEnv.NEWSLETTER_SECRET || ''
const frontendUrl = (apiEnv.FRONTEND_URL || '').replace(/\/$/, '')
const apiEndpoint = (apiEnv.API_ENDPOINT || '').replace(/\/$/, '') || `${frontendUrl}/api`

// ── Readline helper ──────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout })
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

// ── List subscribers ─────────────────────────────────────────────────────

async function listSubscribers() {
  if (!secret) {
    console.error('NEWSLETTER_SECRET is not set in api/.env')
    console.error('Add: NEWSLETTER_SECRET="your-64-char-hex-string"')
    process.exit(1)
  }

  if (!apiEndpoint || apiEndpoint === '/api') {
    console.error('API endpoint could not be determined.')
    console.error('Set FRONTEND_URL or API_ENDPOINT in api/.env')
    process.exit(1)
  }

  console.log(`Fetching subscribers from ${apiEndpoint}/newsletter/subscribers ...`)
  try {
    const res = await fetch(`${apiEndpoint}/newsletter/subscribers`, {
      headers: { Authorization: `Bearer ${secret}` },
    })

    if (!res.ok) {
      console.error(`API returned ${res.status}: ${await res.text()}`)
      process.exit(1)
    }

    const data = await res.json()
    const subscribers = data.subscribers || []
    const count = data.count ?? subscribers.length

    if (count === 0) {
      console.log('\nNo subscribers yet.')
      return
    }

    console.log(`\n${count} subscriber${count === 1 ? '' : 's'}:\n`)
    console.log('  Email                                  Name              Source     Date')
    console.log('  ' + '─'.repeat(80))
    for (const sub of subscribers) {
      const email = (sub.email || '').padEnd(40)
      const name = (sub.firstName || '').padEnd(18)
      const source = (sub.source || '').padEnd(10)
      const date = (sub.subscribedAt || '').slice(0, 10)
      console.log(`  ${email}${name}${source}${date}`)
    }
  } catch (err) {
    console.error(`Failed to reach API: ${err.message}`)
    process.exit(1)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Handle --list flag.
  if (process.argv.includes('--list')) {
    await listSubscribers()
    return
  }

  // Validate arguments.
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage:')
    console.error('  node scripts/send-newsletter.mjs <path-to-newsletter.txt>')
    console.error('  node scripts/send-newsletter.mjs --list')
    process.exit(1)
  }

  const resolvedPath = path.resolve(filePath)
  if (!existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`)
    process.exit(1)
  }

  // Validate config.
  if (!secret) {
    console.error('NEWSLETTER_SECRET is not set in api/.env')
    console.error('Add: NEWSLETTER_SECRET="your-64-char-hex-string"')
    process.exit(1)
  }

  if (!apiEndpoint || apiEndpoint === '/api') {
    console.error('API endpoint could not be determined.')
    console.error('Set FRONTEND_URL or API_ENDPOINT in api/.env')
    process.exit(1)
  }

  const bodyText = readFileSync(resolvedPath, 'utf8').trim()
  if (bodyText === '') {
    console.error('Newsletter file is empty.')
    process.exit(1)
  }

  // Prompt for subject.
  const subject = (await ask('\nNewsletter subject: ')).trim()
  if (subject === '') {
    console.error('Subject is required.')
    rl.close()
    process.exit(1)
  }

  // Fetch subscriber count.
  console.log(`\nFetching subscriber count from ${apiEndpoint}...`)
  let subscriberCount = '?'
  try {
    const res = await fetch(`${apiEndpoint}/newsletter/subscribers`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) {
      const data = await res.json()
      subscriberCount = data.count ?? '?'
    } else {
      console.warn(`  Warning: could not fetch subscribers (${res.status})`)
    }
  } catch (err) {
    console.warn(`  Warning: could not reach API (${err.message})`)
  }

  // Show preview.
  console.log('\n' + '═'.repeat(60))
  console.log('  NEWSLETTER PREVIEW')
  console.log('═'.repeat(60))
  console.log(`  Subject:     ${subject}`)
  console.log(`  Subscribers: ${subscriberCount}`)
  console.log(`  API:         ${apiEndpoint}`)
  console.log('─'.repeat(60))
  const previewLines = bodyText.split('\n').slice(0, 12)
  for (const line of previewLines) {
    console.log(`  ${line}`)
  }
  if (bodyText.split('\n').length > 12) {
    console.log('  ...')
  }
  console.log('═'.repeat(60))

  // Test send.
  const testAnswer = (await ask('\nSend test email to yourself first? (Y/n) ')).trim().toLowerCase()
  if (testAnswer !== 'n' && testAnswer !== 'no') {
    console.log('Sending test...')
    try {
      const res = await fetch(`${apiEndpoint}/newsletter/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ subject, body: bodyText, testOnly: true }),
      })

      const data = await res.json()
      if (data.success) {
        console.log(`  Test email sent. Check your inbox.`)
      } else {
        console.error(`  Test failed: ${data.message || 'Unknown error'}`)
        const proceed = (await ask('Continue anyway? (y/N) ')).trim().toLowerCase()
        if (proceed !== 'y' && proceed !== 'yes') {
          rl.close()
          process.exit(1)
        }
      }
    } catch (err) {
      console.error(`  Test failed: ${err.message}`)
      const proceed = (await ask('Continue anyway? (y/N) ')).trim().toLowerCase()
      if (proceed !== 'y' && proceed !== 'yes') {
        rl.close()
        process.exit(1)
      }
    }
  }

  // Confirm full send.
  const sendAnswer = (
    await ask(`\nSend to all ${subscriberCount} subscribers? (y/N) `)
  )
    .trim()
    .toLowerCase()
  if (sendAnswer !== 'y' && sendAnswer !== 'yes') {
    console.log('Cancelled.')
    rl.close()
    process.exit(0)
  }

  // Send to all.
  console.log('Sending newsletter...')
  try {
    const res = await fetch(`${apiEndpoint}/newsletter/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ subject, body: bodyText, testOnly: false }),
    })

    const data = await res.json()
    if (data.success) {
      console.log('\n' + '═'.repeat(40))
      console.log(`  Sent:   ${data.sent}`)
      console.log(`  Failed: ${data.failed}`)
      console.log(`  Total:  ${data.total}`)
      console.log('═'.repeat(40))
    } else {
      console.error(`\nFailed: ${data.message || 'Unknown error'}`)
    }
  } catch (err) {
    console.error(`\nFailed: ${err.message}`)
  }

  rl.close()
}

main().catch((err) => {
  console.error(err)
  rl.close()
  process.exit(1)
})
