import { IPFS } from "ipfs-core"


interface Backoff {
    retryNumber: number
    lastBackoff: number
    currentBackoff: number
}

interface Status {
    connected: boolean
    lastConnectedAt: number // posix timestamp
    latency: null | number
}


/** 🎛️ Connection interval knobs
 *
 * KEEP_ALIVE_INTERVAL: Interval to keep the connection alive when online
 * BACKOFF_INIT: Starting intervals for fibonacci backoff used when establishing a connection
 * MAX_BACKOFF: Maximum interval to keep trying the connection when offline
 */

const KEEP_ALIVE_INTERVAL =
    1 * 60 * 1000 // 1 minute

const BACKOFF_INIT = {
    retryNumber: 0,
    lastBackoff: 0,
    currentBackoff: 1000
}

const MAX_BACKOFF =
    5 * 60 * 1000 // 5 minutes


export function keepConnectionWith(
    ipfs: IPFS,
    peer: string,
    signal: AbortSignal,
    report: (peer: string, status: Status) => void
) {
    let latestPeerTimeoutId: NodeJS.Timeout | null = null

    const ping = (async function* () {
        for await (const ping of ipfs.ping(peer, { signal })) {
            yield ping
        }
    })()

    keepAlive(BACKOFF_INIT, { connected: false, lastConnectedAt: 0, latency: null })

    // CONNECTIONS
    // -----------

    async function keepAlive(backoff: Backoff, status: Status) {
        const cappedBackoff = Math.min(MAX_BACKOFF, backoff.currentBackoff)
        // Start race between reconnect and ping
        const timeoutId = setTimeoutWithSignal(cappedBackoff, signal, () => reconnect(backoff, status))

        // Track the latest reconnect attempt
        latestPeerTimeoutId = timeoutId

        try {
            // @ts-ignore
            const nextPing = (await ping.next())
            if (nextPing.done) return
            const latency = nextPing.value.time
            const updatedStatus = { connected: true, lastConnectedAt: Date.now(), latency }
            report(peer, updatedStatus)

            // Cancel reconnect because ping won
            clearTimeout(timeoutId)

            // Keep alive after the latest ping-reconnect race, ignore the rest
            if (timeoutId === latestPeerTimeoutId) {
                setTimeoutWithSignal(KEEP_ALIVE_INTERVAL, signal, () => keepAlive(BACKOFF_INIT, updatedStatus))
            }
        } catch {
        }
    }


    async function reconnect(backoff: Backoff, status: Status) {
        const updatedStatus = { ...status, connected: false, latency: null }
        report(peer, updatedStatus)

        try {
            await ipfs.swarm.disconnect(peer)
            await ipfs.swarm.connect(peer)
        } catch {
            // No action needed, we will retry
        }

        if (backoff.currentBackoff < MAX_BACKOFF) {
            const nextBackoff = {
                retryNumber: backoff.retryNumber + 1,
                lastBackoff: backoff.currentBackoff,
                currentBackoff: backoff.lastBackoff + backoff.currentBackoff
            }

            keepAlive(nextBackoff, updatedStatus)
        } else {
            keepAlive(backoff, updatedStatus)
        }
    }

}

function setTimeoutWithSignal(timeoutInMs: number, signal: AbortSignal, run: () => void): NodeJS.Timeout {
    const timeoutId = setTimeout(() => {
        signal.removeEventListener("abort", cancel)
        run()
    }, timeoutInMs)

    function cancel() {
        clearTimeout(timeoutId)
        signal.removeEventListener("abort", cancel)
    }

    signal.addEventListener("abort", cancel)

    return timeoutId
}
