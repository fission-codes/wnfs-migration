/*

This migration added a small CBOR hull around private filesystem blocks.

They would now additionally store information about whether they're encrypted using
AES-GCM or AES-CTR. Previously everything was implicitly AES-CTR.

*/

import all from "it-all"
import * as fs from "fs"
import { CID } from "multiformats"
import * as webnative from "webnative-0.30.0"
import * as ipfsConfig from "webnative-0.30.0/ipfs/config.js"
import * as ipfsConfig29 from "webnative-0.29.0/ipfs/config.js"
import * as identifiers from "webnative-0.30.0/common/identifiers.js"
import * as setup from "webnative-0.30.0/setup.js"
import * as setup29 from "webnative-0.29.0/setup.js"
import * as path from "webnative-0.30.0/path.js"
import FileSystem from "webnative-0.30.0/fs/filesystem.js"

import { nodeImplementation } from "./setup-node-keystore.js"
import { createInMemoryIPFS } from "./in-memory-ipfs.js"
import * as fs_1_0_0 from "./fs-1.0.0.js"


const ipfs = await createInMemoryIPFS()

const [root] = await all(ipfs.dag.import(fs.createReadStream("./tests/fixtures/wnfs-1.0.1-example.car")))
if (root == null) {
    throw new Error(`Couldn't figure out root CID from given CAR file.`)
}
const wnfsCID = root.root.cid

console.log(`Loaded filesystem from CAR file: ${wnfsCID.toString()}`)

setup.setDependencies(nodeImplementation)
setup29.setDependencies(nodeImplementation)
ipfsConfig.set(ipfs)
ipfsConfig29.set(ipfs)

const readKey = "pJW/xgBGck9/ZXwQHNPhV3zSuqGlUpXiChxwigwvUws="
await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))

const filesystem = await FileSystem.empty({ rootKey: readKey, localOnly: true, permissions: {
    fs: {
        private: [path.root()],
        public: [path.root()],
    }
}})

for await (const entry of fs_1_0_0.traverseFileSystem(ipfs, wnfsCID, readKey)) {
    console.log(`Processing ${entry.path}`)
    if (entry.isFile) {
        await filesystem.write(path.file(...entry.path), entry.content)
    } else {
        await filesystem.mkdir(path.directory(...entry.path))
    }
}

const migratedCID = await filesystem.root.put()

console.log(`Finished migration: ${migratedCID}`)

// const carFile = "./migrated.car"
// const stream = fs.createWriteStream(carFile)
// for await (const chunk of ipfs.dag.export(CID.parse(migratedCID))) {
//     stream.write(chunk)
// }
// stream.close()

// console.log(`Wrote to ${carFile}`)

await ipfs.stop()
