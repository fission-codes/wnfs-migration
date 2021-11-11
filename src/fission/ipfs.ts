import child_process from "child_process"
import path from "path"
import * as IPFS from "ipfs-http-client"

import { CLIContext } from "../cli/context.js"
import { keepConnectionWith } from "./peering.js"


export async function createFissionConnectedIPFS(context: CLIContext): Promise<{ ipfs: IPFS.IPFSHTTPClient; controller: AbortController }> {
    const controller = new AbortController()

    // TODO: Handle the case that IPFS is already running gracefully.
    // Doing that would require checking whether the ipfs http api already responds.
    // If it doesn't, make sure to remove the repo.lock and run ipfs.
    const ipfsProcess = child_process.spawn(
        context.ipfsBinPath,
        ["daemon", "--migrate", "--config", path.join(context.fissionDir, "ipfs/")],
        {
            // ignore stdin, pipe stdout for us to receive, inherit our stderr (print errors to the console)
            stdio: ["ignore", "pipe", "inherit"]
        }
    )

    controller.signal.addEventListener("abort", () => {
        if (!ipfsProcess.killed) {
            ipfsProcess.kill()
        }
    }, { once: true })

    try {
        await new Promise<string>((resolve, reject) => {
            let stdout = ""
            ipfsProcess.stdout.setEncoding("utf8")
            ipfsProcess.stdout.on("close", () => {
                ipfsProcess.stdout.removeAllListeners()
                reject(new Error(`ipfs process stdout closed without printing "Daemon is ready"`))
            })
            ipfsProcess.stdout.on("data", (chunk: string) => {
                stdout += chunk
                if (stdout.includes("Daemon is ready")) {
                    resolve(stdout)
                }
            })
        })

        const ipfs = IPFS.create(context.ipfsAPIAddress as any) // any cast, because ipfs-http-client actually allows a string as an argument
        const peers = context.fissionConfig.peers
        const maxRetries = 3
        const timeout = 20 * 1000 // ms

        console.log(`Connected to local ipfs node, version ${(await ipfs.version()).version}`)

        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                await Promise.any(peers.map(addr => ipfs.swarm.connect(addr, { timeout })))
            } catch (e) {
                if (retry >= maxRetries - 1) {
                    if (e instanceof AggregateError) {
                        const errors = e.errors
                        throw new Error(`Couldn't connect to the fission IPFS cluster. Tried these peers: ${peers.map((p, i) => `\n - ${p}\n   (${errors[i].message})`)}`)
                    }
                    throw new Error(`Couldn't connect to the fission IPFS cluster for unknown reason (${e}).`)
                }
            }
        }
        console.log("Connected to the Fission IPFS Cluster")

        for (const peer of peers) {
            keepConnectionWith(ipfs, peer, controller.signal, () => {})
        }

        return { ipfs, controller }
    } catch (e) {
        controller.abort()
        throw e
    }
}
