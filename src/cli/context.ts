import type { Config as IPFSConfig } from "ipfs-core-types/src/config"
import type { Endpoints } from "webnative-0.30/setup/internal"

import path from "path"
import fs from "fs"
import * as yaml from "js-yaml"
import { CID } from "multiformats"

import { FissionConfig, isFissionConfig, isFissionStore } from "../fission/config.js"

export interface CLIContext {
    fissionDir: string
    fissionConfig: FissionConfig
    fissionConfigRootProof: CID | null
    ipfsConfig: IPFSConfig
    ipfsAPIAddress: string
    ipfsBinPath: string
    endpoints: Endpoints
    wnfsReadKey: string
    writeKey: Uint8Array
}

export function createContext(fissionDir: string, endpointsDefault: Endpoints): CLIContext {
    if (!fs.existsSync(fissionDir)) {
        throw new Error("Couldn't open fission's config directory. Please run the fission CLI and link your account first.")
    }

    const ipfsBinPath = path.join(fissionDir, "bin/fission-ipfs")
    const ipfsConfigPath = path.join(fissionDir, "ipfs/config")
    const fissionConfigFilePath = path.join(fissionDir, "config.yaml")
    const fissionStorePath = path.join(fissionDir, "wnfs/store.json")

    if (!fs.existsSync(ipfsBinPath)) {
        throw new Error(`Couldn't find an ipfs binary at ${ipfsBinPath}. Please run the fission CLI first, it will download ipfs for you.`)
    }
    if (!fs.existsSync(ipfsConfigPath)) {
        throw new Error(`Couldn't find an ipfs config at ${ipfsConfigPath}. Please run the fission CLI first, it will generate an ipfs config for you.`)
    }
    if (!fs.existsSync(fissionConfigFilePath)) {
        throw new Error(`Missing fission config file at ${fissionConfigFilePath}. Please run the fission CLI to generate one.`)
    }
    if (!fs.existsSync(fissionStorePath)) {
        throw new Error(`Missing fission filesystem keys at ${fissionStorePath}. Please link your browser account using the fission CLI.`)
    }

    const ipfsConfig: IPFSConfig = JSON.parse(fs.readFileSync(ipfsConfigPath, { encoding: "utf8" }))
    const fissionConfig = yaml.load(fs.readFileSync(fissionConfigFilePath, { encoding: "utf8" }), { filename: fissionConfigFilePath })
    const fissionStore = JSON.parse(fs.readFileSync(fissionStorePath, { encoding: "utf8" }))

    if (!isFissionConfig(fissionConfig)) {
        console.log(fissionConfig)
        throw new Error(`Couldn't load a valid config from ${fissionConfigFilePath}.`)
    }
    if (!isFissionStore(fissionStore)) {
        console.log(fissionStore)
        throw new Error(`Couldn't load filesystem keys from ${fissionStorePath}.`)
    }

    if (!fs.existsSync(fissionConfig.signing_key_path)) {
        throw new Error(`Missing signing key at ${fissionConfig.signing_key_path}.`)
    }

    const writeKey = new Uint8Array(fs.readFileSync(fissionConfig.signing_key_path))

    if (writeKey.length !== 32) {
        throw new Error(`Couldn't load signing key at ${fissionConfig.signing_key_path}. Expected 32-byte ed25519 key. Got ${writeKey.length} bytes.`)
    }

    const rootProof = (() => {
        if (fissionConfig.root_proof == null) {
            return null
        }
        try {
            return CID.parse(fissionConfig.root_proof)
        } catch {
            throw new Error(`Couldn't parse root_proof property in fission config as CID: ${fissionConfig.root_proof}`)
        }
    })()

    const readKey = (() => {
        const mainStore = Object.values(fissionStore)[0]
        if (mainStore == null) {
            throw new Error(`Couldn't find root read key in ${fissionStorePath}.`)
        }
        const key = mainStore["/"]
        if (key == null) {
            throw new Error(`Couldn't find root read key in ${fissionStorePath}.`)
        }
        return key
    })()

    if (ipfsConfig?.Addresses?.API == null) {
        throw new Error(`Couldn't load API address from the ipfs config at ${ipfsConfigPath}. Missing "Address.API" setting.`)
    }

    return {
        fissionDir,
        fissionConfig,
        fissionConfigRootProof: rootProof,
        ipfsConfig,
        ipfsBinPath,
        ipfsAPIAddress: ipfsConfig.Addresses.API,
        endpoints: {
            ...endpointsDefault,
            api: remoteFromParam() ?? endpointsDefault.api
        },
        wnfsReadKey: readKey,
        writeKey
    }
}


function remoteFromParam(): string | null {
    let remote
    let idx
    idx = process.argv.indexOf("-R")
    if (idx != -1) {
        remote = process.argv[idx + 1]
    }
    idx = process.argv.indexOf("--remote")
    if (idx != -1) {
        remote = process.argv[idx + 1]
    }
    if (remote === "production") {
        return "https://runfission.com"
    }
    if (remote === "staging") {
        return "https://runfission.net"
    }
    return remote || null
}
