import http from 'http'
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import QR from 'qrcode-terminal'
import axios from 'axios'

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n-bxsv-production.up.railway.app/webhook/whatsapp-evolution'
const PORT = parseInt(process.env.PORT || '3000')

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('OK')
})
server.listen(PORT, () => console.log(`Health check on port ${PORT}`))

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    
    const sock = makeWASocket({
        auth: state,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            QR.generate(qr, { small: true })
            console.log('--- ESCANEA EL QR DE ARRIBA CON WHATSAPP ---')
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
                console.log('Deslogueado. Elimina auth_info y redeploy.')
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
