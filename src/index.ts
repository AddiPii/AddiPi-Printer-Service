//AddiPi Printer Service
import cron from 'node-cron';
import { CosmosClient, Container } from '@azure/cosmos';
import express from 'express';
import type {Request, Response} from 'express'
import { Client as ServiceClient} from 'azure-iothub'
import getLocalISO from './helpers/getLocalISO.js';


const IOT_HUB_SERVICE_CS: string = process.env.IOT_HUB_SERVICE_CS as string;
const COSMOS_ENDPOINT: string = process.env.COSMOS_ENDPOINT as string;
const COSMOS_KEY: string = process.env.COSMOS_KEY as string;
const PORT_ENV:string = process.env.PRINTER_PORT || "3050"

const missing: Array<string> = [];
if (!IOT_HUB_SERVICE_CS) missing.push('IOT_HUB_SERVICE_CONNECTION_STRING');
if (!COSMOS_ENDPOINT) missing.push('COSMOS_ENDPOINT');
if (!COSMOS_KEY) missing.push('COSMOS_KEY');

if (missing.length) {
	console.error('Missing required environment variables:', missing.join(', '));
	console.error('Please set these before starting the service. Example (PowerShell):');
    console.error('IOT_HUB_SERVICE_CONNECTION_STRING get it from IoT Hub → Shared access policies → service → Primary connection string');
	console.error('$env:COSMOS_ENDPOINT = "https://<account>.documents.azure.com:443/"');
	console.error('$env:COSMOS_KEY = "<primary-key>"');
	process.exit(1);
}

let container: Container | undefined;
let cosmosClient: CosmosClient | undefined;

try {
    cosmosClient = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    container = cosmosClient.database('addipi').container('jobs');
} catch (err) {
    if (err instanceof Error){
        console.error('Failed to create Cosmos DB client:', err.message);
    }
    else{
        console.error('Failed to create Cosmos DB client:', String(err));
    }
    process.exit(1);
}


const serviceClient = ServiceClient.fromConnectionString(IOT_HUB_SERVICE_CS);

async function startScheduledJobs(): Promise<void> {
    if (!container) {
        console.error('Cosmos DB container not initialized.');
        return;
    }

    const nowDate: string = getLocalISO()
    const now: string = nowDate.substring(0, 19)
    const query: string = `SELECT * FROM c WHERE c.status = 'scheduled' AND c.scheduledAt <= "${now}"`;
    const { resources: jobs }: { resources: Array<{ id: string, status: string; scheduledAt: string; fileId: string;}> } = await container.items.query(query).fetchAll();
    // console.log(query)
    console.log(`Job ${jobs[0]?.id} info: ${jobs}`)


    for (const job of jobs){
        if(!job.id) continue;

        job.status = 'printing';
        await container.item(job.id, job.id).replace(job);

        try {
            const methodParams = {
                deviceId: "raspberry-pi-mkt-01", 
                methodName: "startPrint",
                payload: JSON.stringify({ event: 'print_start', fileId: job.fileId, jobId: job.id }),
                responseTimeoutInSeconds: 30
            }

            const response = await serviceClient.invokeDeviceMethod(methodParams.deviceId, methodParams);
            console.log(`STARTED ${job.fileId} at ${job.scheduledAt} | Pi odpowiedziało: ${response}`);
            console.log(`STARTED ${job.fileId} at ${job.scheduledAt} `);

       } catch (error) {
            console.error(`Błąd wysyłania print_start dla ${job.fileId}:`, error);

            // Cofnij status na failed
            job.status = 'failed';
            await container.item(job.id, job.id).replace(job);
        }
        
    }
}

cron.schedule('* * * * *', startScheduledJobs);
console.log('Scheduler runs every mninute');


const app = express();


app.use(express.json());

app.get('/', (request: Request, response:Response<string>): void => {
  response.json('Addipi Printer Service działa! 🚀');
});

type healthMessageType = {
    ok: boolean,
    time: string
}

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



// app.get('/printer/devices', (request, response) => {
// TODO: lista zarejestrowanych drukarek/urządzeń (statusy, lastSeen, capabilities) — może pobierać z IoT Hub
// })

// app.get('/printer/metrics', (request, response) => {
//     TODO: proste liczniki przydatne do dashboardu Response: { "queued": 12, "printing": 2, "failed24h": 3 }
// })

app.use((request: Request, response: Response<{error: string}>): void => {
    response.status(404).json({error: 'Endpoint not found'})
})


const PORT = parseInt(PORT_ENV)

app.listen(PORT, (): void => {
  console.log(`Serwer działa na porcie ${PORT}`);
});