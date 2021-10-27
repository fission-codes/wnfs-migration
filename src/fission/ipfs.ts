import type { Config as IPFSConfig } from "ipfs-core-types/src/config"

import child_process from "child_process"
import path from "path"
import fs from "fs"
import * as yaml from "js-yaml"
import * as IPFS from "ipfs-http-client"

import { isFissionConfig } from "./config.js"


export async function createFissionConnectedIPFS() {
    const fissionDir = "/home/philipp/.config/fission/"

    if (!fs.existsSync(fissionDir)) {
        throw new Error("Couldn't open fission's config directory. Please run the fission CLI and link your account first.")
    }

    const ipfsConfigPath = path.join(fissionDir, "ipfs/config")
    const ipfsConfig: IPFSConfig = JSON.parse(fs.readFileSync(ipfsConfigPath, { encoding: "utf8" }))
    const fissionConfigFilePath = path.join(fissionDir, "config.yaml")
    const fissionConfig = yaml.load(fs.readFileSync(fissionConfigFilePath, { encoding: "utf8" }), { filename: fissionConfigFilePath })

    if (!isFissionConfig(fissionConfig)) {
        console.log(fissionConfig)
        throw new Error(`Couldn't load a valid config from ${fissionConfigFilePath}. Did you run the fission CLI and link your account already?`)
    }

    if (ipfsConfig?.Addresses?.API == null) {
        throw new Error(`Couldn't load API address from the ipfs config at ${ipfsConfigPath}. Missing "Address.API" setting.`)
    }

    // TODO: Handle the case that IPFS is already running gracefully.
    // Doing that would require checking whether the ipfs http api already responds.
    // If it doesn't, make sure to remove the repo.lock and run ipfs.
    const ipfsProcess = child_process.spawn(
        path.join(fissionDir, "bin/fission-ipfs"),
        ["daemon", "--migrate", "--config", path.join(fissionDir, "ipfs/")],
        {
            // ignore stdin, pipe stdout for us to receive, inherit our stderr (print errors to the console)
            stdio: ["ignore", "pipe", "inherit"]
        }
    )

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

    const ipfs = IPFS.create(ipfsConfig.Addresses.API as any)

    for (let retry = 0; retry < 5; retry++) {
        try {
            await Promise.any(fissionConfig.peers.map(addr => ipfs.swarm.connect(addr, { timeout: 5000 })))
        } catch {
        }
        if (retry === 4) {
            throw new Error(`Couldn't connect to the fission IPFS cluster.`)
        }
    }
    console.log("Connected to the Fission IPFS Cluster")

    return ipfs
}
