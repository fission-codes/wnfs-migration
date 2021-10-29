import utils from "keystore-idb/lib/utils.js"
import { Config, CryptoSystem, KeyStore, KeyUse, Msg, PublicKey } from "keystore-idb/lib/types.js"
import config from "keystore-idb/lib/config.js"
import aes from "keystore-idb/lib/aes/index.js"
import rsa from "keystore-idb/lib/rsa/index.js"


export class InMemoryRSAKeyStore implements KeyStore {

    cfg: Config
    exchangeKeyPair: CryptoKeyPair
    writeKeyPair: CryptoKeyPair
    inMemoryStore: Record<string, CryptoKey>

    constructor(cfg: Config, exchangeKeyPair: CryptoKeyPair, writeKeyPair: CryptoKeyPair) {
        this.cfg = cfg
        this.inMemoryStore = {}
        this.exchangeKeyPair = exchangeKeyPair
        this.writeKeyPair = writeKeyPair
    }

    static async init(maybeCfg?: Partial<Config>): Promise<InMemoryRSAKeyStore> {
        const cfg = config.normalize({
            ...(maybeCfg || {}),
            type: CryptoSystem.RSA
        })

        const { rsaSize, hashAlg } = cfg

        const exchangeKeyPair = await rsa.makeKeypair(rsaSize, hashAlg, KeyUse.Exchange)
        const writeKeyPair = await rsa.makeKeypair(rsaSize, hashAlg, KeyUse.Write)

        return new InMemoryRSAKeyStore(cfg, exchangeKeyPair, writeKeyPair)
    }

    async exchangeKey() {
        return this.exchangeKeyPair
    }

    async writeKey() {
        return this.writeKeyPair
    }

    async getSymmKey(keyName: string, cfg?: Partial<Config>): Promise<CryptoKey> {
        const mergedCfg = config.merge(this.cfg, cfg)
        const maybeKey = this.inMemoryStore[keyName]
        if (maybeKey !== null) {
            return maybeKey
        }
        const key = await aes.makeKey(config.symmKeyOpts(mergedCfg))
        this.inMemoryStore[keyName] = key
        return key
    }

    async keyExists(keyName: string): Promise<boolean> {
        const key = this.inMemoryStore[keyName]
        return key !== null
    }

    async deleteKey(keyName: string): Promise<void> {
        delete this.inMemoryStore[keyName]
    }

    async destroy(): Promise<void> {
        this.inMemoryStore = {}
    }

    async importSymmKey(keyStr: string, keyName: string, cfg?: Partial<Config>): Promise<void> {
        const mergedCfg = config.merge(this.cfg, cfg)
        const key = await aes.importKey(keyStr, config.symmKeyOpts(mergedCfg))
        this.inMemoryStore[keyName] = key
    }

    async exportSymmKey(keyName: string, cfg?: Partial<Config>): Promise<string> {
        const key = await this.getSymmKey(keyName, cfg)
        return await aes.exportKey(key)
    }

    async encryptWithSymmKey(msg: string, keyName: string, cfg?: Partial<Config>): Promise<string> {
        const mergedCfg = config.merge(this.cfg, cfg)
        const key = await this.getSymmKey(keyName, cfg)
        const cipherText = await aes.encryptBytes(
            utils.strToArrBuf(msg, mergedCfg.charSize),
            key,
            config.symmKeyOpts(mergedCfg)
        )
        return utils.arrBufToBase64(cipherText)
    }

    async decryptWithSymmKey(cipherText: string, keyName: string, cfg?: Partial<Config>): Promise<string> {
        const mergedCfg = config.merge(this.cfg, cfg)
        const key = await this.getSymmKey(keyName, cfg)
        const msgBytes = await aes.decryptBytes(
            utils.base64ToArrBuf(cipherText),
            key,
            config.symmKeyOpts(mergedCfg)
        )
        return utils.arrBufToStr(msgBytes, mergedCfg.charSize)
    }



    async sign(msg: Msg, cfg?: Partial<Config>): Promise<string> {
        const mergedCfg = config.merge(this.cfg, cfg)
        const writeKey = await this.writeKey()

        if (writeKey.privateKey == null) {
            throw new Error("need write key")
        }

        return utils.arrBufToBase64(await rsa.sign(
            msg,
            writeKey.privateKey,
            mergedCfg.charSize
        ))
    }

    async verify(
        msg: string,
        sig: string,
        publicKey: string | PublicKey,
        cfg?: Partial<Config>
    ): Promise<boolean> {
        const mergedCfg = config.merge(this.cfg, cfg)

        return await rsa.verify(
            msg,
            sig,
            publicKey,
            mergedCfg.charSize,
            mergedCfg.hashAlg
        )
    }

    async encrypt(
        msg: Msg,
        publicKey: string | PublicKey,
        cfg?: Partial<Config>
    ): Promise<string> {
        const mergedCfg = config.merge(this.cfg, cfg)

        return utils.arrBufToBase64(await rsa.encrypt(
            msg,
            publicKey,
            mergedCfg.charSize,
            mergedCfg.hashAlg
        ))
    }

    async decrypt(
        cipherText: Msg,
        publicKey?: string | PublicKey, // unused param so that keystore interfaces match
        cfg?: Partial<Config>
    ): Promise<string> {
        const exchangeKey = await this.exchangeKey()
        const mergedCfg = config.merge(this.cfg, cfg)

        if (exchangeKey.privateKey == null) {
            throw new Error("Need private exchange key set")
        }

        return utils.arrBufToStr(
            await rsa.decrypt(
                cipherText,
                exchangeKey.privateKey,
            ),
            mergedCfg.charSize
        )
    }

    async publicExchangeKey(): Promise<string> {
        const exchangeKey = await this.exchangeKey()
        return rsa.getPublicKey(exchangeKey)
    }

    async publicWriteKey(): Promise<string> {
        const writeKey = await this.writeKey()
        return rsa.getPublicKey(writeKey)
    }
}
