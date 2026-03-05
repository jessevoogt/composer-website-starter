import { execSync } from 'node:child_process'

const TARGET_PORTS = [
  { label: 'Astro', port: Number(process.env.ASTRO_PORT || 4321) },
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getListeningPids(port) {
  const normalizedPort = Number(port)
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) return []

  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${normalizedPort} | findstr LISTENING`, {
        encoding: 'utf8',
      }).trim()
      if (!output) return []

      const pids = new Set()
      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts[parts.length - 1])
        if (Number.isInteger(pid)) pids.add(pid)
      }
      return [...pids]
    }

    const output = execSync(`lsof -n -iTCP:${normalizedPort} -sTCP:LISTEN -t`, { encoding: 'utf8' }).trim()
    if (!output) return []
    return [
      ...new Set(
        output
          .split('\n')
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid)),
      ),
    ]
  } catch {
    return []
  }
}

function terminatePid(pid) {
  if (!Number.isInteger(pid)) return
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' })
    return
  }
  process.kill(pid, 'SIGKILL')
}

async function forceFreePort(port, label) {
  const pids = getListeningPids(port).filter((pid) => pid !== process.pid)
  if (pids.length === 0) {
    console.log(`[ports] ${label} port ${port} is free`)
    return
  }

  console.warn(`[ports] ${label} port ${port} is in use. Terminating process(es): ${pids.join(', ')}`)

  for (const pid of pids) {
    try {
      terminatePid(pid)
    } catch {
      // Process may have already exited.
    }
  }

  await sleep(400)

  const remainingPids = getListeningPids(port).filter((pid) => pid !== process.pid)
  if (remainingPids.length > 0) {
    throw new Error(`${label} port ${port} is still in use after termination attempt: ${remainingPids.join(', ')}`)
  }

  console.log(`[ports] ${label} port ${port} is now free`)
}

async function main() {
  const seenPorts = new Set()
  for (const { label, port } of TARGET_PORTS) {
    if (seenPorts.has(port)) continue
    seenPorts.add(port)
    await forceFreePort(port, label)
  }
}

await main()
