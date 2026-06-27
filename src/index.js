import http from 'http'
import { makeWASocket, DisconnectReason } from '@whiskeysockets/baileys'
import QR from 'qrcode-terminal'
import axios from 'axios'
import { useMongoAuthState } from './mongoAuthState.js'

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n-bxsv-production.up.railway.app/webhook/whatsapp-evolution'
const PORT = parseInt(process.env.PORT || '3000')
const MONGO_URL = process.env.MONGODB_URI

if (!MONGO_URL) {
    console.error('Falta la variable de entorno MONGODB_URI. Configúrala en Railway.')
    process.exit(1)
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
})
server.listen(PORT, () => console.log(`Health check on port ${PORT}`))

async function startBot() {
    const { state, saveCreds } = await useMongoAuthState(MONGO_URL)

    const sock = makeWASocket({
        auth: state,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            // Try pairing code first (works better on Railway)
            const phoneNumber = process.env.PAIRING_PHONE || ''
            if (phoneNumber) {
                try {
                    const code = await sock.requestPairingCode(phoneNumber)
                    const formatted = code.match(/.{1,4}/g)?.join('-') || code
                    console.log('')
                    console.log('╔══════════════════════════════════════╗')
                    console.log('║       WHATSAPP PAIRING CODE         ║')
                    console.log('║                                    ║')
                    console.log('║        ' + formatted + '         ║')
                    console.log('║                                    ║')
                    console.log('║  Open WhatsApp > Linked Devices    ║')
                    console.log('║  > Link with phone number         ║')
                    console.log('║  Enter this code in WhatsApp      ║')
                    console.log('╚══════════════════════════════════════╝')
                    console.log('')
                } catch (e) {
                    console.log('Pairing code failed, falling back to QR...')
                    QR.generate(qr, { small: true })
                }
            } else {
                QR.generate(qr, { small: true })
                console.log('--- ESCANEA EL QR DE ARRIBA CON WHATSAPP ---')
            }
        }
        if (connection === 'open') {
            console.log('Conectado a WhatsApp!')
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                console.log('Reconectando...')
                startBot()
            } else {
                console.log('Deslogueado. Borra la colección "auth" en Mongo y redeploy para volver a escanear el QR.')
            }
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message || msg.key?.fromMe) return

            const body = msg.message?.conversation ||
                         msg.message?.extendedTextMessage?.text ||
                         msg.message?.imageMessage?.caption || ''

            if (!body) return
            const from = msg.key?.remoteJid
            const pushName = msg.pushName || ''
            console.log(`Msg from ${pushName} (${from}): ${body.substring(0,100)}`)
            await axios.post(WEBHOOK_URL, {
                from,
                body,
                name: pushName,
                timestamp: Date.now()
            }, { timeout: 5000 })
        } catch (e) {
            console.error('Webhook error:', e.message)
        }
    })
}

startBot().catch(e => console.error('Fatal:', e))
