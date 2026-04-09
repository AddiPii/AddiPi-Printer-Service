import type { Request, Response } from 'express';
import { Client as ServiceClient } from 'azure-iothub';
import type { Container } from '@azure/cosmos';
import { initCosmosContainer } from '../db/initCosmosContainer.js';
import { CONFIG } from '../config/config.js';

interface AuthenticatedRequest extends Request {
    user?: {
        userId?: string;
        id?: string;
        role?: string;
    };
}

const container: Container = initCosmosContainer(
    CONFIG.COSMOS_ENDPOINT,
    CONFIG.COSMOS_KEY
)

const serviceClient: ServiceClient = ServiceClient.fromConnectionString(
    CONFIG.IOT_HUB_SERVICE_CS
)

// GET /printer/jobs - Lista wszystkich jobow
export async function getAllJobs(req: Request, res: Response): Promise<void> {
    try {
        const { status, limit = 50, offset = 0 } = req.query

        let query = 'SELECT * FROM c'
        if (status) {
            query += ` WHERE c.status = "${status}"`
        }
        query += ` ORDER BY c._ts DESC OFFSET ${offset} LIMIT ${limit}`

        const { resources: jobs } = await container.items.query(query).fetchAll()

        res.json({
            jobs,
            count: jobs.length,
            limit: Number(limit),
            offset: Number(offset)
        })
    } catch (error) {
        console.error('Error fetching jobs:', error)
        res.status(500).json({ error: 'Failed to fetch jobs' })
    }
}

// GET /printer/jobs/:jobId - Szczegoly konkretnego joba
export async function getJobById(req: Request, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        res.json({ job })
    } catch (error) {
        console.error('Error fetching job:', error)
        res.status(500).json({ error: 'Failed to fetch job' })
    }
}

// POST /printer/jobs/:jobId/cancel - Anuluj drukowanie
export async function cancelJob(req: Request, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        if (!['scheduled', 'pending', 'printing', 'waiting_for_printer_ready', 'delayed'].includes(job.status)) {
            res.status(400).json({
                error: 'Job cannot be cancelled',
                currentStatus: job.status
            })
            return
        }

        if (job.status === 'printing') {
            try {
                const methodParams = {
                    methodName: 'cancelPrint',
                    payload: JSON.stringify({ jobId }),
                    responseTimeoutInSeconds: 60
                }

                const deviceId = job.deviceId || 'raspberry-pi-mkt-01'
                await serviceClient.invokeDeviceMethod(deviceId, methodParams)

                console.log(`Cancel command sent to device ${deviceId} for job ${jobId}`)
            } catch (iotError) {
                console.error('Error sending cancel command to device:', iotError)
            }
        }

        job.status = 'cancelled'
        job.cancelledAt = new Date().toISOString()

        await container.item(jobId, jobId).replace(job)

        console.log(`Job ${jobId} cancelled`)
        res.json({
            message: 'Job cancelled successfully',
            jobId,
            status: 'cancelled'
        })
    } catch (error) {
        console.error('Error cancelling job:', error)
        res.status(500).json({ error: 'Failed to cancel job' })
    }
}

// POST /printer/jobs/:jobId/confirm-ready - Potwierdz gotowosc drukarki i uruchom druk
export async function confirmPrinterReady(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        if (!['waiting_for_printer_ready', 'delayed'].includes(job.status)) {
            res.status(400).json({
                error: 'Job is not waiting for readiness confirmation',
                currentStatus: job.status
            })
            return
        }

        const requesterId = req.user?.userId || req.user?.id
        const isAdmin = req.user?.role === 'admin'
        const isOwner = Boolean(requesterId && job.userId === requesterId)

        if (!isAdmin && !isOwner) {
            res.status(403).json({ error: 'Only job owner or admin can confirm readiness' })
            return
        }

        const now = new Date().toISOString()
        const previousState = {
            status: job.status,
            readinessConfirmedAt: job.readinessConfirmedAt,
            startedAt: job.startedAt,
            delayedReason: job.delayedReason,
            failureReason: job.failureReason
        }

        job.status = 'printing'
        job.readinessConfirmedAt = now
        job.startedAt = job.startedAt || now
        job.delayedReason = undefined

        await container.item(jobId, jobId).replace(job)

        try {
            const methodParams = {
                methodName: 'startPrint',
                payload: JSON.stringify({ event: 'print_start', fileId: job.fileId, jobId }),
                responseTimeoutInSeconds: 60
            }

            const deviceId = job.deviceId || 'raspberry-pi-mkt-01'
            await serviceClient.invokeDeviceMethod(deviceId, methodParams)
        } catch (iotError) {
            console.error('Error sending start command after readiness confirmation:', iotError)

            job.status = previousState.status
            job.readinessConfirmedAt = previousState.readinessConfirmedAt
            job.startedAt = previousState.startedAt
            job.delayedReason = previousState.delayedReason
            job.failureReason = previousState.failureReason
            await container.item(jobId, jobId).replace(job)

            res.status(503).json({
                error: `Printer did not accept start command. Job reverted to ${previousState.status}.`,
                currentStatus: job.status,
                previousStatus: previousState.status
            })
            return
        }

        res.json({
            message: 'Printer readiness confirmed. Print started.',
            jobId,
            status: 'printing'
        })
    } catch (error) {
        console.error('Error confirming printer readiness:', error)
        res.status(500).json({ error: 'Failed to confirm printer readiness' })
    }
}

// GET /printer/status - Aktualny status drukarki
export async function getPrinterStatus(req: Request, res: Response): Promise<void> {
    try {
        const deviceId = (req.query.deviceId as string) || 'raspberry-pi-mkt-01'

        const methodParams = {
            methodName: 'getStatus',
            payload: {},
            responseTimeoutInSeconds: 60
        }

        console.log('Wywoluje metode getStatus dla:', deviceId)

        const result = await serviceClient.invokeDeviceMethod(deviceId, methodParams) as any
        const methodResult = result.result

        if (methodResult && methodResult.status === 200) {
            const payload = typeof methodResult.payload === 'string'
                ? JSON.parse(methodResult.payload)
                : methodResult.payload

            res.json({
                deviceId,
                ...payload
            })
        } else {
            res.status(503).json({
                error: 'Device not responding',
                deviceId,
                methodResult: methodResult
            })
        }
    } catch (error) {
        console.error('Exception during getStatus:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (errorMessage.includes('504') || errorMessage.includes('Timed out')) {
            res.status(504).json({
                error: 'Device timeout',
                message: 'Device is not responding in time.',
                deviceId: (req.query.deviceId as string) || 'raspberry-pi-mkt-01'
            })
        } else {
            res.status(503).json({
                error: 'Failed to get printer status',
                message: errorMessage,
                deviceId: (req.query.deviceId as string) || 'raspberry-pi-mkt-01'
            })
        }
    }
}

// GET /printer/metrics - Metryki dla dashboardu
export async function getMetrics(req: Request, res: Response): Promise<void> {
    try {
        const queries = {
            queued: `SELECT VALUE COUNT(1) FROM c WHERE c.status IN ('scheduled', 'pending', 'waiting_for_printer_ready', 'delayed')`,
            printing: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'printing'`,
            waitingForReady: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'waiting_for_printer_ready'`,
            delayed: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'delayed'`,
            completed: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'completed'`,
            failed: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'failed'`,
            cancelled: `SELECT VALUE COUNT(1) FROM c WHERE c.status = 'cancelled'`,
            failed24h: `
                SELECT VALUE COUNT(1) FROM c
                WHERE c.status = 'failed'
                AND c.failedAt >= DateTimeAdd('hh', -24, GetCurrentDateTime())
            `
        }

        const metrics: Record<string, number> = {}

        for (const [key, query] of Object.entries(queries)) {
            const { resources } = await container.items.query(query).fetchAll()
            metrics[key] = resources[0] || 0
        }

        const totalQuery = `SELECT VALUE COUNT(1) FROM c`
        const { resources: totalResources } = await container.items
            .query(totalQuery)
            .fetchAll()
        metrics.total = totalResources[0] || 0

        res.json({
            metrics,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error('Error fetching metrics:', error)
        res.status(500).json({ error: 'Failed to fetch metrics' })
    }
}

// GET /printer/jobs/:jobId/progress - Live progress konkretnego joba
export async function getJobProgress(req: Request, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        const progress = {
            jobId: job.id,
            fileId: job.fileId,
            status: job.status,
            progress: job.progress || 0,
            printTime: job.printTime || 0,
            printTimeLeft: job.printTimeLeft || 0,
            startedAt: job.startedAt,
            lastUpdatedAt: job.lastUpdatedAt,
            deviceId: job.deviceId
        }

        res.json(progress)
    } catch (error) {
        console.error('Error fetching job progress:', error)
        res.status(500).json({ error: 'Failed to fetch job progress' })
    }
}

// POST /printer/jobs/:jobId/retry - Ponow nieudane zadanie
export async function retryJob(req: Request, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        if (job.status !== 'failed' && job.status !== 'cancelled') {
            res.status(400).json({
                error: 'Only failed or cancelled jobs can be retried',
                currentStatus: job.status
            })
            return
        }

        job.status = 'pending'
        job.failedAt = undefined
        job.failureReason = undefined
        job.cancelledAt = undefined
        job.waitingStartedAt = undefined
        job.readinessConfirmedAt = undefined
        job.reminder60SentAt = undefined
        job.reminder3hSentAt = undefined
        job.reminder12hSentAt = undefined
        job.delayedAt = undefined
        job.autoCancelledAt = undefined
        job.delayedReason = undefined
        job.progress = 0

        await container.item(jobId, jobId).replace(job)

        console.log(`Job ${jobId} reset to pending for retry`)
        res.json({
            message: 'Job reset successfully and will be picked up by scheduler',
            jobId,
            status: 'pending'
        })
    } catch (error) {
        console.error('Error retrying job:', error)
        res.status(500).json({ error: 'Failed to retry job' })
    }
}

// DELETE /printer/jobs/:jobId - Usun job (tylko completed/failed/cancelled)
export async function deleteJob(req: Request, res: Response): Promise<void> {
    try {
        const { jobId } = req.params

        const { resource: job } = await container
            .item(jobId, jobId)
            .read()

        if (!job) {
            res.status(404).json({ error: 'Job not found' })
            return
        }

        if (['scheduled', 'pending', 'printing', 'waiting_for_printer_ready', 'delayed'].includes(job.status)) {
            res.status(400).json({
                error: 'Cannot delete active job. Cancel it first.',
                currentStatus: job.status
            })
            return
        }

        await container.item(jobId, jobId).delete()

        console.log(`Job ${jobId} deleted`)
        res.json({
            message: 'Job deleted successfully',
            jobId
        })
    } catch (error) {
        console.error('Error deleting job:', error)
        res.status(500).json({ error: 'Failed to delete job' })
    }
}
