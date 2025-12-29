import { EventHubConsumerClient } from "@azure/event-hubs";
import type { Container } from "@azure/cosmos";
import { initCosmosContainer } from "../db/initCosmosContainer.js";
import { CONFIG } from "../config/config.js";
import type { TelemetryMessage } from "../type.js";


export class TelemetryListener {
    private consumerClient: EventHubConsumerClient
    private container: Container
    private isRunning: boolean = false

    constructor(eventHubConnectionString: string){
        this.consumerClient = new EventHubConsumerClient(
            '$Default',
            eventHubConnectionString
        )

        this.container = initCosmosContainer(
            CONFIG.COSMOS_ENDPOINT,
            CONFIG.COSMOS_KEY
        )
        
        console.log('Telemetry Listener initialized')
    }

    async start(): Promise<void> {
        if (this.isRunning){
            console.log('Telemetry Listener is already running')
            return
        }

        this.isRunning = true
        console.log('Starting telemetry listener')

        try {
            const subscription = this.consumerClient.subscribe({
                processEvents: async (events, context) => {
                    for (const event of events) {
                        await this.handleTelemetryMessage(event.body)
                    }
                },
                processError: async (error, context) => {
                    console.error(
                        `Error from partition ${context.partitionId}: ${error.message}`
                    )
                }
            })
            console.log('Telemetry Listener started successfully')

            await new Promise(() => {})
        } catch(err){
            console.error('Error starting telemetry listener: ', err)
            this.isRunning = false
            throw err
        }
    }

    
}