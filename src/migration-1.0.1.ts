/*

This migration added a small CBOR hull around private filesystem blocks.

They would now additionally store information about whether they're encrypted using
AES-GCM or AES-CTR. Previously everything was implicitly AES-CTR.

*/

import all from "it-all"
import * as fs from "fs"
import * as cbor from "cborg"
import * as uint8arrays from "uint8arrays"
import { CID } from "multiformats"
import * as webnative from "webnative-0.29.0"
import * as ipfsConfig from "webnative-0.29.0/ipfs/config.js"
import * as identifiers from "webnative-0.29.0/common/identifiers.js"
import * as path from "webnative-0.29.0/path.js"
import FileSystem from "webnative-0.29.0/fs/filesystem.js"
import MMPT from "webnative-0.29.0/fs/protocol/private/mmpt.js"

import "./setup-node-keystore.js"
import { createInMemoryIPFS } from "./in-memory-ipfs.js"


const ipfs = await createInMemoryIPFS()
ipfsConfig.set(ipfs)

const [root] = await all(ipfs.dag.import(fs.createReadStream("./tests/fixtures/wnfs-1.0.1-example.car")))
const wnfsCID = root.root.cid

console.log(wnfsCID)

const readKey = "pJW/xgBGck9/ZXwQHNPhV3zSuqGlUpXiChxwigwvUws="
await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))

const filesystem = await FileSystem.fromCID(wnfsCID.toString(), {
    localOnly: true,
    permissions: {
        fs: {
            public: [path.root()],
            private: [path.root()]
        }
    }
})

if (filesystem == null) throw "Couldn't load WNFS"

// here is the bulk of the work: Load all MMPT nodes and wrap them with some cbor
const mmpt = filesystem.root.mmpt

const newMMPT = MMPT.create()

for (const privateRef of await mmpt.members()) {
    console.log(`migrating block ${privateRef.cid}`)
    const block = uint8arrays.concat(await all(ipfs.cat(privateRef.cid)))
    const withHull = cbor.encode({
        alg: "AES-CTR",
        cip: block
    })
    const addResult = await ipfs.add(withHull, { cidVersion: 1, pin: false })
    await newMMPT.add(privateRef.name, addResult.cid.toString())
}

filesystem.root.mmpt = newMMPT
await filesystem.root.setVersion({ major: 1, minor: 0, patch: 1 })
await filesystem.root.updatePuttable("private", newMMPT)
const migratedCID = await filesystem.root.put()

console.log(`Finished migration: ${migratedCID}`)

const carFile = "./migrated.car"
const stream = fs.createWriteStream(carFile)
for await (const chunk of ipfs.dag.export(CID.parse(migratedCID))) {
    stream.write(chunk)
}
stream.close()

console.log(`Wrote to ${carFile}`)

await ipfs.stop()
