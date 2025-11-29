# AddiPi Printer Service

[EN]


AddiPi Printer Service is a lightweight microservice responsible for managing and executing print jobs. It supports scheduling jobs, storing them in Azure Cosmos DB, and sending start commands to devices via Azure IoT Hub (MQTT). It also exposes a simple HTTP server with health and basic management endpoints.

> A service that handles print jobs: reads scheduled jobs from Cosmos DB, sends commands to devices via Azure IoT, and provides a simple HTTP health/management API.

This document describes the AddiPi Printer Service — a small microservice that schedules and executes print jobs for networked printers (or printers controlled by devices such as Raspberry Pi). The service reads scheduled jobs from Azure Cosmos DB, updates job status, and triggers device actions via Azure IoT Hub.

This README provides a comprehensive overview of the project, including architecture, environment variables, local development, Docker and Docker Compose usage, scheduling behavior, Cosmos/IoT integration details, troubleshooting, testing and recommended next steps.

## Table of contents

- Project overview
- Architecture and components
- Environment variables
- Local development
- Build and production run
- Docker and Compose
- Monorepo orchestration
- Scheduling and date handling
- Integration with Azure IoT Hub
- Logging, errors and retries
- Troubleshooting
- Testing and CI
- Security and production recommendations
- Contributing
- License

## Project overview

- Purpose: execute scheduled print jobs by sending a `print_start` command to devices via Azure IoT Hub and record status updates in Cosmos DB.
- Stack: TypeScript, Node.js, Express, Azure SDKs, Docker.

## Architecture and components

- `src/` — main service code (Express app, scheduler, Cosmos and IoT integrations).
- Cosmos DB client: `@azure/cosmos` (database `addipi`, container `jobs` by default).
- IoT communication:
  - `azure-iot-device` and `azure-iot-device-mqtt` for device-side interactions (device SDK)
  - `azure-iothub` for service-side operations (invoke device direct methods)
- Scheduler: `node-cron`, configured to run every minute.
- Dockerfile: multi-stage build to produce a small runtime image.
- Compose files: service-level and top-level compose (monorepo orchestration).

## Environment variables

Required variables (examples):

- `IOT_CONN_STRING` or `IOT_HUB_SERVICE_CS` — IoT Hub connection string (device or service string depending on operation). Example: `HostName=...;DeviceId=...;SharedAccessKey=...`.
- `COSMOS_ENDPOINT` — Cosmos DB endpoint, e.g. `https://<account>.documents.azure.com:443/`
- `COSMOS_KEY` — primary key for Cosmos DB
- `PRINTER_PORT` — optional HTTP port (default: `3050`)

Notes:

- `process.env` values are strings; convert and validate (e.g. port to number) before use.
- Use a secrets store (Azure Key Vault, GitHub Secrets) for production.

## Local development

Prerequisites: Node.js 18+ (or later LTS), npm.

Install dependencies:

```powershell
npm install
```

Start in development (hot reload):

```powershell
npm run dev
```

Endpoints:

- `GET /` — basic health/status
- `GET /printer/health` — returns `{ ok: true, time: "YYYYMMDD_HHMMSS" }`

## Build and production run

Compile TypeScript:

```powershell
npm run build
```

Run compiled code:

```powershell
node dist/index.js
```

The `start` script runs compilation and then executes the compiled artifact.

## Docker

Build the multi-stage image:

```powershell
docker build -t addipi-printer-service .
```

Run with `.env` file:

```powershell
docker run --rm --env-file .env -p 3050:3050 addipi-printer-service
```

If you have native dependency build issues on Alpine, the builder uses Debian-slim to improve compatibility. Add build tools (`build-essential`, `python3`) in the builder stage if needed.

### Service-level Docker Compose

From the service folder (`AddiPi-Printer-Service`):

```powershell
docker compose up --build
```

### Monorepo top-level Compose

If the repository contains multiple services (e.g. `AddiPi-Printer-Service`, `AddiPi-Files-Service`, `AddiPi-Queue-Service`), a top-level `docker-compose.yml` orchestrates all services. Paths in the compose file are relative to the compose file location — if you move the compose file, update the `build.context` references.

## Scheduling and date handling

- The scheduler runs once per minute and finds `scheduled` jobs whose `scheduledAt` is <= now.
- The service accepts `scheduledAt` in flexible ISO formats such as `2025-11-26T16:50` (without seconds). The code normalizes and parses these strings before making scheduling decisions.
- Display and logs use the format `%Y%m%d_%H%M%S` (example: `20251126_142530`).

## Integration with Azure IoT Hub

- Use `azure-iothub` to invoke direct methods on devices (e.g. `startPrint`) and `azure-iot-device` for device clients.
- Because packages can export differently under CJS/ESM, the code detects and falls back to `default` exports when necessary.

## Logging, errors and retries

- The service uses console logs for visibility. In production, redirect logs to a centralized store.
- When invoking device methods, implement retry/backoff to handle transient network issues. Failed jobs are marked as `failed` in Cosmos DB.

## Troubleshooting

- `Message is not a constructor` — caused by mismatched exports in `azure-iot-device`. The repo includes defensive exports resolution; if you still see the error, collect export keys and we can adapt imports.
- ESM warning: `Reparsing as ES module because module syntax was detected` — fix by either enabling ESM in `package.json` (`"type": "module"`) and adjusting `tsconfig`, or compile to CommonJS and run in CJS mode (current Docker builds to CommonJS by default).

If Docker build fails due to native dependencies, ensure the builder image includes build tools (the provided builder uses Debian-slim; you can add `build-essential`/`python3` if native modules require compilation).

## Testing and CI

- Write unit tests mocking Cosmos (or use in-memory emulator) and IoT Hub. Use `nock` or dependency injection for the Azure SDK calls.
- CI pipeline should run lint, tests, build, then optionally build Docker images and run smoke tests.

## Security & production recommendations

- Store secrets in Key Vault or CI secret storage. Do not commit `.env`.
- Use least-privilege credentials and rotate keys regularly.
- Add readiness/liveness probes and graceful shutdown.

## Contributing

Contributions are welcome. Ideas:

- Expand REST API for job CRUD and control endpoints.
- Add authentication and role-based access control.
- Add unit/integration tests and CI workflows.
- Improve logging and monitoring.

Please open issues or PRs for suggested changes.

## License

The project currently uses the ISC license in `package.json`. Add a `LICENSE` file if needed.

---

If you want, I can also:

- add `docker-compose.dev.yml` for hot-reload and bind mounts,
- add example `curl` commands for endpoints,
- add `CONTRIBUTING.md` with PR guidelines.
