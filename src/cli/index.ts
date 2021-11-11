import os from "os"
import path from "path"
import itAll from "it-all"
import itMap from "it-map"
import inquirer from "inquirer"
import { CID } from "multiformats"
import { IPFS } from "ipfs-core"
import fetch from "node-fetch"
import * as uint8arrays from "uint8arrays"
import * as webnative from "webnative-0.30"
import * as ed25519 from "noble-ed25519"

import { CLIContext, createContext } from "./context.js"
import { createFissionConnectedIPFS } from "../fission/ipfs.js"
import * as fs_1_0_0 from "../versions/fs-1.0.0.js"
import * as fs_2_0_0 from "../versions/fs-2.0.0.js"


export async function run() {
    const context = createContext(path.join(os.homedir(), ".config/fission"), webnative.setup.endpoints({}))

    console.log(`Looking up data root for ${context.fissionConfig.username}`)

    const dataRoot = await figureOutDataRoot(context)

    console.log(`Data root is ${dataRoot}`)

    console.log("Loading IPFS...")

    const { ipfs, controller } = await createFissionConnectedIPFS(context)
    // will log success
    try {
        console.log(`Looking up your filesystem version (https://${context.fissionConfig.username}.files.fission.name/version)`)
        const version = uint8arrays.toString(uint8arrays.concat(await itAll(ipfs.cat(`${dataRoot}/version`))))
        console.log(`Your filesystem currently is at version ${version}`)

        if (version === "2.0.0") {
            throw new Error(`This migration tool is made for migrations from version 1.0.0 to 2.0.0. This account has already been migrated.`)
        }

        if (version !== "1.0.0") {
            throw new Error(`This migration tool is made for migrations from version 1.0.0 to 2.0.0. You might need a newer version of this migration tool.`)
        }

        const readKey = context.wnfsReadKey
        const migratedCID = await fs_2_0_0.filesystemFromEntries(
            itMap(fs_1_0_0.traverseFileSystem(ipfs, dataRoot, readKey), async entry => {
                console.log(`Processing ${webnative.path.toPosix(webnative.path.file(...entry.path))}`)
                return entry
            }),
            ipfs,
            readKey
        )

        console.log(`Finished migration: ${migratedCID}`)

        const answers = await inquirer.prompt([{
            name: "confirmed",
            type: "confirm",
            message: "Are you sure you want to overwrite your filesystem with a migrated version?"
        }])

        if (!answers.confirmed) {
            throw new Error(`User cancelled.`)
        }

        const ucan = await figureOutUcan(context, ipfs)

        console.log(`Created authorization UCAN. Updating data root...`)

        await setDataRoot(migratedCID, `Bearer ${ucan}`, context)

        console.log(`Migration done!`)
    } finally {
        console.log(`Shutting down IPFS...`)
        controller.abort()
    }
}


async function figureOutDataRoot(context: CLIContext): Promise<CID> {
    const dataRoot = await getUsernameDataRoot(context.fissionConfig.username, context)
    if (dataRoot == null) {
        throw new Error(`Your account either doesn't exist or doesn't have a filesystem attached to it. Most likely because it was created from the fission CLI and not from the browser. Please try linking a browser-based account using the fission CLI.`)
    }
    return dataRoot
}

async function figureOutUcan(context: CLIContext, ipfs: IPFS): Promise<string> {
    let proof
    if (context.fissionConfigRootProof != null) {
        const tokenPath = `${context.fissionConfigRootProof.toString()}/bearer.jwt`
        const resolved = JSON.parse(uint8arrays.toString(uint8arrays.concat(await itAll(ipfs.cat(tokenPath)))))
        if (typeof resolved !== "string") {
            throw new Error(`Couldn't parse UCAN at ${tokenPath}: ${resolved}`)
        }
        const bearerPrefix = "Bearer "
        if (!resolved.startsWith(bearerPrefix)) {
            throw new Error(`Couldn't parse UCAN at ${tokenPath}: ${resolved}`)
        }
        proof = resolved.substring(bearerPrefix.length)
    }

    const pubKey = await ed25519.getPublicKey(context.writeKey)
    const ourDid = webnative.did.publicKeyToDid(uint8arrays.toString(pubKey, "base64pad"), webnative.did.KeyType.Edwards)

    const ucanParts = await webnative.ucan.build({
        addSignature: false,
        audience: context.fissionConfig.server_did,
        issuer: ourDid,
        potency: "APPEND",
        proof,
        resource: "*",
    })

    // monkey-patch the algorithm to match what we're doing
    ucanParts.header.alg = "EdDSA"

    const encoded = {
        header: webnative.ucan.encodeHeader(ucanParts.header),
        payload: webnative.ucan.encodePayload(ucanParts.payload),
    }

    const headerAndPayload = `${encoded.header}.${encoded.payload}`
    const signature = uint8arrays.toString(await ed25519.sign(uint8arrays.fromString(headerAndPayload), context.writeKey), "base64urlpad")
    return `${headerAndPayload}.${signature}`
}


async function getUsernameDataRoot(username: string, context: CLIContext): Promise<CID | null> {
    const apiEndpoint = `${context.endpoints.api}/${context.endpoints.apiVersion}/api`

    const resp = await fetch(`${apiEndpoint}/user/data/${username}`)
    if (!resp.ok) {
        return null
    }
    const respStr = await resp.json()
    if (typeof respStr !== "string") {
        throw new Error(`Unexpected response for data root lookup for ${username}: ${respStr}`)
    }
    try {
        return CID.parse(respStr)
    } catch {
        return null
    }
}

// The JWT identifiers the user
async function setDataRoot(dataRoot: CID, jwt: string, context: CLIContext): Promise<void> {
    const apiEndpoint = `${context.endpoints.api}/${context.endpoints.apiVersion}/api`

    const resp = await fetch(`${apiEndpoint}/user/data/${dataRoot.toString()}`, {
        method: "PUT",
        headers: {
            "authorization": jwt
        },
    })
    if (!resp.ok) {
        throw new Error(`Failed to update data root. HTTP Code ${resp.status}. Message: ${await resp.text()}`)
    }
}

