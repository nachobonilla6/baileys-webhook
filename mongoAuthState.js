import { MongoClient } from 'mongodb'
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys'

// Guarda y restaura el estado de autenticación de Baileys (creds + signal keys)
// en una sola colección de MongoDB, en vez de en disco local.
// Esto sobrevive a restarts/redeploys de Railway porque el filesystem
// del contenedor es efímero pero Mongo no.

export async function useMongoAuthState(mongoUrl, dbName = 'baileys', collectionName = 'auth') {
    const client = new MongoClient(mongoUrl)
    await client.connect()
    const collection = client.db(dbName).collection(collectionName)

    const writeData = async (key, data) => {
        const serialized = JSON.parse(JSON.stringify(data, BufferJSON.replacer))
        await collection.updateOne(
            { _id: key },
            { $set: { value: serialized } },
            { upsert: true }
        )
    }

    const readData = async (key) => {
        try {
            const doc = await collection.findOne({ _id: key })
            if (!doc) return null
            return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver)
        } catch {
            return null
        }
    }

    const removeData = async (key) => {
        try {
            await collection.deleteOne({ _id: key })
        } catch {
            // noop
        }
    }

    const creds = (await readData('creds')) || initAuthCreds()

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {}
                await Promise.all(
                    ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`)
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value)
                        }
                        data[id] = value
                    })
                )
                return data
            },
            set: async (data) => {
                const tasks = []
                for (const category in data) {
                    for (const id in data[category]) {
                        const value = data[category][id]
                        const key = `${category}-${id}`
                        tasks.push(value ? writeData(key, value) : removeData(key))
                    }
                }
                await Promise.all(tasks)
            }
        }
    }

    const saveCreds = () => writeData('creds', state.creds)

    const clearCreds = () => collection.deleteMany({})

    return { state, saveCreds, clearCreds }
}
