import http from 'http'
import { createBot, createProvider, createFlow, addKeyword } from '@bot-whatsapp/bot'
import { BaileysProvider } from '@bot-whatsapp/provider-baileys'
import { JsonFileAdapter } from '@bot-whatsapp/database-json'
import axios from 'axios'

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n-bxsv-production.up.railway.app/webhook/whatsapp-evolution'
const PORT = parseInt(process.env.PORT || '3000')

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('OK')
})
server.listen(PORT, () => console.log(`Health check on port ${PORT}`))

const main = async () => {
    const adapterDB = new JsonFileAdapter()
    const adapterProvider = createProvider(BaileysProvider)

    adapterProvider.on('message', async (message) => {
        try {
            if (message.key?.fromMe) return
            const body = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || ''
            if (!body) return
            const from = message.key?.remoteJid
            console.log(`Msg from ${message.pushName} (${from}): ${body.substring(0,100)}`)
            await axios.post(WEBHOOK_URL, {
                from, body, name: message.pushName || '', timestamp: Date.now()
            }, { timeout: 5000 })
        } catch (e) {
            console.error('Webhook error:', e.message)
        }
    })

    const flow = addKeyword(['hola']).addAnswer('¡Hola! ¿Cómo puedo ayudarte?')
    createBot({ flow: createFlow([flow]), provider: adapterProvider, database: adapterDB })
    console.log('Bot iniciado. Escanea el QR desde los logs.')
}

main().catch(e => console.error('Fatal:', e))
