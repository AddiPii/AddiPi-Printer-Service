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
                    console.log(`✓ Agent ${message.deviceId} started`)
                    break

                case 'agent_stopped':
                    console.log(`⚠ Agent ${message.deviceId} stopped`)
                    break

                default:
                    console.log(`Unknown event type: ${message.event}`)
            }
        } catch (err) {
            console.error('Error handling telemetry message: ', err)
        }
    }

    private async handlePrintStarted(
        message: TelemetryMessage
    ): Promise<void> {
        if(!message.jobId) return

        try {
            const { resource: job } = await this.container
                .item(message.jobId, message.jobId)
                .read()

            if(job) {
                job.status = 'printing'
                job.startedAt = message.timestamp
                job.deviceId = message.deviceId

                await this.container
                    .item(message.jobId, message.jobId)
                    .replace(job)
                
                console.log(`Job ${message.jobId} status updated to printing`)
            }
        } catch (err) {
            console.error(`Error updating job ${message.jobId}: `, err)
        }
    }

    private async handlePrintProgress(
        message: TelemetryMessage
    ): Promise<void> {
        if(!message.jobId) return

        try {
            const { resource: job } = await this.container
                .item(message.jobId, message.jobId)
                .read()
            
            if(job) {
                job.progress = message.progress || 0
                job.printTime = message.printTime || 0
                job.printTimeLeft = message.printTimeLeft || 0
                job.lastUpdatedAt = message.timestamp || 0

                await this.container
                    .item(message.jobId, message.jobId)
                    .replace(job)

                console.log(
                    `Job ${message.jobId} progress: ${message.progress?.toFixed(1)}%`
                )
            }
        } catch (err) {
            console.error(`Error updating progress for job ${message.jobId}:`, err)
        }
    }

    private async handlePrintCompleted(
        message: TelemetryMessage
    ): Promise<void> {
        if (!message.jobId) return

        try {
            const { resource: job } = await this.container
                .item(message.jobId, message.jobId)
                .read()

            if (job) {
                job.status = 'completed'
                job.completedAt = message.timestamp
                job.printDuration = message.printDuration || 0
                job.progress = 100

                await this.container
                    .item(message.jobId, message.jobId)
                    .replace(job)

                console.log(`Job ${message.jobId} completed successfully`)
            }
        } catch (err) {
            console.error(`Error marking job ${message.jobId} as completed:`, err)
        }
    }

    private async handlePrintFailed(
        message: TelemetryMessage
    ): Promise<void> {
        if(!message.jobId) return

        try {
            const { resource: job } = await this.container
                .item(message.jobId, message.jobId)
                .read()

            if (job) {
                job.status = 'failed'
                job.failedAt = message.timestamp
                job.failureReason = message.reason || 'Unknown error'

                await this.container
                    .item(message.jobId, message.jobId)
                    .replace(job)

                console.log(`Job ${message.jobId} failed: ${message.reason}`)
            }
        } catch (err) {
            console.error(`Error marking job ${message.jobId} as failed:`, err)
        }
    }

    private async handlePrintCancelled(
        message: TelemetryMessage
    ): Promise<void> {
        if(!message.jobId) return

        try {
            const { resource: job } = await this.container
                .item(message.jobId, message.jobId)
                .read()

            if (job) {
                job.status = 'cancelled'
                job.cancelledAt = message.timestamp

                await this.container
                    .item(message.jobId, message.jobId)
                    .replace(job)

                console.log(`⚠ Job ${message.jobId} cancelled`)
            }
        } catch (err) {
            console.error(`Error marking job ${message.jobId} as cancelled:`, err)
        }
    }
}