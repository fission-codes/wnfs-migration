// package imports
import type { IPFS } from "ipfs-core"
import { CID } from "multiformats"
// webnative imports
import * as webnative from "webnative-0.29.0"
import * as ipfsConfig from "webnative-0.29.0/ipfs/config.js"
import * as setup from "webnative-0.29.0/setup.js"
import * as identifiers from "webnative-0.29.0/common/identifiers.js"
import * as path from "webnative-0.29.0/path.js"
import { isBlob } from "webnative-0.29.0/common/index.js"
import FileSystem from "webnative-0.29.0/fs/filesystem.js"
// relative imports
import { nodeImplementation } from "./setup-node-keystore.js"
import { Entry } from "./common.js"


setup.setDependencies(nodeImplementation)

export async function* traverseFileSystem(ipfs: IPFS, rootWNFSCID: CID, readKey: string): AsyncGenerator<Entry, void> {
    ipfsConfig.set(ipfs)
    await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))
    const filesystem = await FileSystem.fromCID(rootWNFSCID.toString(), {
        localOnly: true,
        permissions: {
            fs: {
                public: [path.root()],
                private: [path.root()]
            }
        }
    })

    if (filesystem == null) throw "Couldn't load WNFS"

    yield* traverseEntries(["public"], filesystem)
    yield* traverseEntries(["private"], filesystem)
}

async function* traverseEntries(pathSoFar: string[], fs: FileSystem): AsyncGenerator<Entry, void> {
    for (const [name, entry] of Object.entries(await fs.ls(path.directory(...pathSoFar)))) {
        const entryPath = [...pathSoFar, name]
        if (entry.isFile) {
            const content = await fs.read(path.file(...entryPath))
            if (content == null) {
                console.warn(`Missing file content at ${entryPath}`)
            } else if (isBlob(content)) {
                console.warn(`Retrieved file as Blob. We can't handle that. At ${entryPath}`)
            } else yield {
                path: entryPath,
                isFile: true,
                content
            }
        } else {
            yield {
                path: entryPath,
                isFile: false,
            }
            yield* traverseEntries(entryPath, fs)
        }
    }
}

export async function filesystemFromEntries(entryStream: AsyncIterable<Entry>, ipfs: IPFS, readKey: string): Promise<CID> {
    ipfsConfig.set(ipfs)

    await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))

    const filesystem = await FileSystem.empty({ rootKey: readKey, localOnly: true, permissions: {
        fs: {
            private: [path.root()],
            public: [path.root()],
        }
    }})

    for await (const entry of entryStream) {
        if (entry.isFile) {
            await filesystem.write(path.file(...entry.path), entry.content)
        } else {
            await filesystem.mkdir(path.directory(...entry.path))
        }
    }

    return CID.parse(await filesystem.root.put())
}
