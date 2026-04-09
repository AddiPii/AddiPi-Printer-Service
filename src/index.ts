//AddiPi Printer Service
import cron from 'node-cron';
import express from 'express';
import type {Request, Response} from 'express'
import cors from 'cors'
import { CONFIG } from './config/config.js';
import { startScheduledJobs } from './services/startScheludedJobs.js';
import type { healthMessageType } from './type.js';
import { TelemetryListener } from './services/telemetryListener.js';
import { printerRouter } from './routes/printerRoutes.js';
import { monitorPrinterReadiness } from './services/printerReadinessMonitor.js';


const PORT: number = CONFIG.PORT


const telemetryListener = new TelemetryListener(CONFIG.IOT_HUB_EVENT_HUB_CS)
telemetryListener.start().catch(err => {
  console.error('Failed to start Telemetry Listener: ', err)
})

cron.schedule('* * * * *', startScheduledJobs)
console.log('Scheduler runs every minute')

cron.schedule('*/5 * * * *', monitorPrinterReadiness)
console.log('Readiness monitor runs every 5 minutes')


const app = express()


app.use(express.json())

app.use(cors())

app.get('/', (request: Request, response:Response<string>): void => {
  response.json('Addipi Printer Service działa! 🚀')
})


const healthMessage: healthMessageType = {
    ok: true,
    time: new Date().toLocaleString('pl-PL')
}

app.get('/printer/health', (
    request: Request,
    response:Response<healthMessageType>
): void => {

    response.json(healthMessage)

})

app.use('/printer', printerRouter)

// app.get('/printer/devices', (request, response) => {
// TODO: lista zarejestrowanych drukarek/urządzeń (statusy, lastSeen, capabilities) — może pobierać z IoT Hub
// })


app.use((request: Request, response: Response<{error: string}>): void => {
    response.status(404).json({error: 'Endpoint not found'})
})


app.listen(PORT, (): void => {
  console.log(`Serwer działa na porcie ${PORT}`);
})


process.on('SIGTERM', async() => {
  console.log('SIGTERM received, shutting down...')
  await telemetryListener.stop()
  process.exit(0)
})


process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...')
  await telemetryListener.stop()
  process.exit(0)
})
