import { webcrypto } from "one-webcrypto"

import tweetnacl from "tweetnacl"
import utils from "keystore-idb/lib/utils.js"
import { CharSize, Config, CryptoSystem, KeyStore, KeyUse, Msg, PublicKey, SymmKeyLength } from "keystore-idb/lib/types.js"
import config from "keystore-idb/lib/config.js"
import aes from "keystore-idb/lib/aes/index.js"
import rsa from "keystore-idb/lib/rsa/index.js"

import { Storage } from "./in-memory.js"
import { InMemoryRSAKeyStore } from "./memory-keystore.js"


//-------------------------------------
// Crypto node implementations
//-------------------------------------

const encrypt = async (data: Uint8Array, keyStr: string): Promise<Uint8Array> => {
  const key = await aes.importKey(keyStr, { length: SymmKeyLength.B256 })
  const encrypted = await aes.encryptBytes(data, key)
  return new Uint8Array(encrypted)
}

const decrypt = async (encrypted: Uint8Array, keyStr: string): Promise<Uint8Array> => {
  const key = await aes.importKey(keyStr, { length: SymmKeyLength.B256 })
  const decryptedBuf = await aes.decryptBytes(encrypted, key)
  return new Uint8Array(decryptedBuf)
}

const genKeyStr = async (): Promise<string> => {
  const key = await aes.makeKey({ length: SymmKeyLength.B256 })
  return aes.exportKey(key)
}

const decryptGCM = async (encrypted: string, keyStr: string, ivStr: string): Promise<string> => {
  const iv = utils.base64ToArrBuf(ivStr)
  const sessionKey = await webcrypto.subtle.importKey(
    "raw",
    utils.base64ToArrBuf(keyStr),
    "AES-GCM",
    false,
    [ "encrypt", "decrypt" ]
  )

  // Decrypt secrets
  const decrypted = await webcrypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    sessionKey,
    utils.base64ToArrBuf(encrypted)
  )
  return utils.arrBufToStr(decrypted, CharSize.B8)
}

const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const buf = bytes.buffer
  const hash = await webcrypto.subtle.digest("SHA-256", buf)
  return new Uint8Array(hash)
}

const rsaVerify = (message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> => {
  const keyStr = utils.arrBufToBase64(publicKey.buffer)
  return rsa.verify(message, signature, keyStr)
}

const ed25519Verify = (message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> => {
  return new Promise(resolve => resolve(tweetnacl.sign.detached.verify(message, signature, publicKey)))
}



//-------------------------------------
// Dependency Injection Implementation
//-------------------------------------

const getKeystore = (() => {
  let keystore: null | InMemoryRSAKeyStore = null

  return async function get() {
    if (keystore == null) {
      keystore = await InMemoryRSAKeyStore.init()
    }
    return keystore
  }
})()

const inMemoryStorage = new Storage()

export const nodeImplementation = {
  hash: {
    sha256: sha256
  },
  aes: {
    encrypt: encrypt,
    decrypt: decrypt,
    genKeyStr: genKeyStr,
    decryptGCM: decryptGCM,
  },
  rsa: {
    verify: rsaVerify
  },
  ed25519: {
    verify: ed25519Verify
  },
  keystore: {
    async publicExchangeKey(): Promise<string> {
      const ks = await getKeystore()
      return ks.publicExchangeKey()
    },
    async publicWriteKey(): Promise<string> {
      const ks = await getKeystore()
      return ks.publicWriteKey()
    },
    async decrypt(encrypted: string): Promise<string> {
      const ks = await getKeystore()
      return ks.decrypt(encrypted)
    },
    async sign(message: string, charSize: number): Promise<string> {
      const ks = await getKeystore()
      return ks.sign(message, { charSize })
    },
    async importSymmKey(key: string, name: string): Promise<void> {
      const ks = await getKeystore()
      return ks.importSymmKey(key, name)
    },
    async exportSymmKey(name: string): Promise<string> {
      const ks = await getKeystore()
      return ks.exportSymmKey(name)
    },
    async keyExists(name:string): Promise<boolean> {
      const ks = await getKeystore()
      return ks.keyExists(name)
    },
    async getAlg(): Promise<string> {
      const ks = await getKeystore()
      return ks.cfg.type
    },
    async clear(): Promise<void> {
      return
    },
  },
  storage: {
    getItem: inMemoryStorage.getItem,
    setItem: inMemoryStorage.setItem,
    removeItem: inMemoryStorage.removeItem,
    clear: inMemoryStorage.clear,
  }
}
