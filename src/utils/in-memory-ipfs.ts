import type { IPFS } from "ipfs-core"

import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import * as dagPB from "@ipld/dag-pb"
import * as Ipfs from "ipfs-core"
import { BlockCodec } from "multiformats/codecs/interface"
import { MemoryDatastore } from "datastore-core/memory"
import { MemoryBlockstore } from "blockstore-core/memory"
import { createRepo } from "ipfs-repo"
import { nanoid } from "nanoid"


export async function createInMemoryIPFS(): Promise<IPFS> {
  const dir = tempDir()
  fs.mkdirSync(dir)

  const memoryDs = new MemoryDatastore()
  const memoryBs = new MemoryBlockstore()

  return await Ipfs.create({
    offline: true,
    silent: true,
    preload: {
      enabled: false,
    },
    config: {
      Addresses: {
        Swarm: ["/ip4/0.0.0.0/tcp/4002"],
        API: "/ip4/127.0.0.1/tcp/5002",
        Gateway: "/ip4/127.0.0.1/tcp/9090"
      },
      Discovery: {
        MDNS: {
          Enabled: false
        },
        webRTCStar: {
          Enabled: false
        }
      }
    },
    libp2p: {
      peerStore: {
        persistence: false
      },
      config: {
        peerDiscovery: {
          autoDial: false
        }
      }
    },
    repo: createRepo(
      dir,
      codeOrName => {
        const lookup: Record<string, BlockCodec<number, unknown>> = {
          [dagPB.code]: dagPB,
          [dagPB.name]: dagPB
        }

        return Promise.resolve(lookup[codeOrName])
      }, {
      root: memoryDs,
      blocks: memoryBs,
      keys: memoryDs,
      datastore: memoryDs,
      pins: memoryDs
    }, {
      repoLock: {
        lock: async () => ({ close: async () => { return } }),
        locked: async () => false
      },
      autoMigrate: false,
    }
    )
  })
}


function tempDir(): string {
  const osTmpDir = fs.realpathSync(os.tmpdir())
  return path.join(osTmpDir, nanoid())
}
