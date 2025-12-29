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

    private async handleTelemetryMessage(
        message: TelemetryMessage
    ): Promise<void> {
        try {
            console.log(
                `Received telemetry: ${message.event} from ${message.deviceId}`
            )

            switch (message.event) {
                case 'print_started':
                    await this.handlePrintStarted(message)
                    break
                
                case 'print_progress':
                    await this.handlePrintProgress(message)
                    break
                
                case 'print_completed':
                    await this.handlePrintCompleted(message)
                    break

                case 'print_failed':
                    await this.handlePrintFailed(message)
                    break

                case 'print_cancelled':
                    await this.handlePrintCancelled(message)
                    break

                case 'agent_started':
                    console.log(`✓ Agent ${message.deviceId} started`);
                    break

                case 'agent_stopped':
                    console.log(`⚠ Agent ${message.deviceId} stopped`);
                    break

                default:
                    console.log(`Unknown event type: ${message.event}`)
            }
        } catch (err) {
            console.error('Error handling telemetry message: ', err)
        }
    }

    
}