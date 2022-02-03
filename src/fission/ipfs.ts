import * as IPFS from "ipfs-core"
import * as process from "child_process"
import * as path from "path"

import { CLIContext } from "../cli/context.js"
import { keepConnectionWith } from "./peering.js"


export async function createFissionConnectedIPFS(context: CLIContext): Promise<{ ipfs: IPFS.IPFS; controller: AbortController }> {
    const controller = new AbortController()

    try {
        if (context.ipfsConfig.Addresses) {
            context.ipfsConfig.Addresses.Swarm = []
        }

        const ipfs = await IPFS.create({
            preload: {
                enabled: false
            },
            config: context.ipfsConfig
        })
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
            keepConnectionWith(ipfs, peer, controller.signal, () => null)
        }

        return { ipfs, controller }
    } catch (e) {
        controller.abort()
        throw e
    }
}

export function runFissionIpfsCommand(command: string[], context: CLIContext, signal?: AbortSignal): Promise<string> {
    const ipfsCommand = ["--config", path.join(context.fissionDir, "ipfs/"), ...command]
    const ipfsProcess = process.spawn(
        context.ipfsBinPath,
        ipfsCommand,
        {
            // ignore stdin, pipe stdout for us to receive, inherit our stderr (print errors to the console)
            stdio: ["ignore", "pipe", "inherit"]
        }
    )

    let output = ""
    ipfsProcess.stdout.setEncoding("utf8")
    ipfsProcess.stdout.on("data", (chunk: string) => output += chunk)

    return new Promise((resolve, reject) => {
        ipfsProcess.on("exit", code => {
            if (code === 0) {
                resolve(output)
            } else {
                reject(new Error(`Running "${ipfsCommand.join(" ")}" exited with code ${code}`))
            }
        })

        signal?.addEventListener("abort", () => {
            reject(new Error("Aborted"))
        })
    })
}
