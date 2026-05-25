import { Router } from 'express';
import {
    getAllJobs,
    getJobById,
    cancelJob,
    getPrinterStatus,
    getMetrics,
    getJobProgress,
    retryJob,
    deleteJob,
    confirmPrinterReady
} from '../controllers/printerController.js';
import requireAuth from '../middleware/requireAuth.js';
import requireAdmin from '../middleware/requireAdmin.js';


export const printerRouter = Router()


printerRouter.get('/jobs', getAllJobs);
printerRouter.get('/jobs/:jobId', requireAuth ,getJobById);
printerRouter.get('/jobs/:jobId/progress', getJobProgress);
printerRouter.post('/jobs/:jobId/cancel', requireAuth, cancelJob);
printerRouter.post('/jobs/:jobId/retry', requireAuth, retryJob);
printerRouter.post('/jobs/:jobId/confirm-ready', requireAuth, confirmPrinterReady);
printerRouter.delete('/jobs/:jobId', requireAuth ,requireAdmin ,deleteJob);

printerRouter.get('/status', getPrinterStatus);

printerRouter.get('/metrics', getMetrics);
