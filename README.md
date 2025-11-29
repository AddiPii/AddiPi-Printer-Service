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


[PL]
AddiPi Printer Service to lekka mikro-usługa odpowiedzialna za zarządzanie i wykonywanie zadań drukowania. Obsługuje harmonogram zadań, przechowywanie ich w Azure Cosmos DB oraz wysyłanie poleceń startu do urządzeń przez Azure IoT Hub (MQTT). Udostępnia także prosty serwer HTTP z endpointami zdrowia i podstawowej administracji.

> Usługa obsługująca zadania drukowania: odczytuje zaplanowane zadania z Cosmos DB, wysyła polecenia do urządzeń przez Azure IoT i udostępnia prosty API health/management.

Dokument ten opisuje AddiPi Printer Service — małą mikro-usługę, która planuje i wykonuje zadania drukowania dla sieciowych drukarek (lub urządzeń sterujących drukarkami, np. Raspberry Pi). Usługa odczytuje zaplanowane zadania z Azure Cosmos DB, aktualizuje ich status i wywołuje akcje na urządzeniach poprzez Azure IoT Hub.

Poniższy README zawiera kompleksowy przegląd projektu, w tym architekturę, zmienne środowiskowe, uruchamianie lokalne, użycie Dockera i Docker Compose, zachowanie harmonogramu, integrację z Cosmos/IoT, wskazówki rozwiązywania problemów, testowanie i rekomendacje produkcyjne.

## Spis treści

- Przegląd projektu
- Architektura i składniki
- Zmienne środowiskowe
- Rozwój lokalny
- Budowanie i uruchomienie produkcyjne
- Docker i Compose
- Orkiestracja w monorepo
- Harmonogram i obsługa dat
- Integracja z Azure IoT Hub
- Logowanie, błędy i retry
- Rozwiązywanie problemów
- Testy i CI
- Bezpieczeństwo i rekomendacje produkcyjne
- Wkład (Contributing)
- Licencja

## Przegląd projektu

- Cel: wykonywanie zaplanowanych zadań drukowania przez wysłanie polecenia `print_start` do urządzeń za pośrednictwem Azure IoT Hub i zapisywanie aktualizacji statusu w Cosmos DB.
- Stos technologiczny: TypeScript, Node.js, Express, SDK Azure, Docker.

## Architektura i składniki

- `src/` — główny kod usługi (aplikacja Express, scheduler, integracje z Cosmos i IoT).
- Klient Cosmos DB: `@azure/cosmos` (domyślnie baza `addipi`, kontener `jobs`).
- Komunikacja IoT:
  - `azure-iot-device` i `azure-iot-device-mqtt` dla klienta urządzenia (device SDK)
  - `azure-iothub` dla operacji po stronie serwisu (invoke direct methods)
- Harmonogram: `node-cron`, skonfigurowany do uruchamiania co minutę.
- `Dockerfile`: multi-stage build generujący niewielki obraz runtime.
- Pliki Compose: plik na poziomie serwisu i najwyższy poziom dla orkiestracji monorepo.

## Zmienne środowiskowe

Wymagane zmienne (przykłady):

- `IOT_CONN_STRING` lub `IOT_HUB_SERVICE_CS` — connection string do IoT Hub (urządzenie lub service string w zależności od operacji). Przykład: `HostName=...;DeviceId=...;SharedAccessKey=...`.
- `COSMOS_ENDPOINT` — endpoint Cosmos DB, np. `https://<account>.documents.azure.com:443/`
- `COSMOS_KEY` — klucz główny Cosmos DB
- `PRINTER_PORT` — opcjonalny port HTTP (domyślnie: `3050`)

Uwaga:

- Wartości w `process.env` są typu string; dokonaj konwersji i walidacji (np. port na number) przed użyciem.
- W środowisku produkcyjnym używaj magazynu sekretów (Azure Key Vault, GitHub Secrets).

## Rozwój lokalny

Wymagania: Node.js 18+ (lub nowsze LTS), npm.

Instalacja zależności:

```powershell
npm install
```

Start w trybie developerskim (hot reload):

```powershell
npm run dev
```

Endpointy:

- `GET /` — podstawowy health/status
- `GET /printer/health` — zwraca `{ ok: true, time: "YYYYMMDD_HHMMSS" }`

## Budowanie i uruchomienie produkcyjne

Kompilacja TypeScript:

```powershell
npm run build
```

Uruchomienie skompilowanego kodu:

```powershell
node dist/index.js
```

Skrypt `start` może kompilować i uruchamiać skompilowany artefakt.

## Docker

Budowanie obrazu multi-stage:

```powershell
docker build -t addipi-printer-service .
```

Uruchomienie z plikiem `.env`:

```powershell
docker run --rm --env-file .env -p 3050:3050 addipi-printer-service
```

Jeśli wystąpią problemy z natywnymi zależnościami na Alpine, builder używa Debian-slim dla lepszej kompatybilności. W razie potrzeby dodaj narzędzia budowania (`build-essential`, `python3`) w etapie budowy.

### Docker Compose (poziom serwisu)

W folderze serwisu (`AddiPi-Printer-Service`):

```powershell
docker compose up --build
```

### Docker Compose w monorepo (poziom top-level)

Jeśli repo zawiera wiele usług (np. `AddiPi-Printer-Service`, `AddiPi-Files-Service`, `AddiPi-Queue-Service`), plik `docker-compose.yml` na poziomie repozytorium orkiestruje wszystkie serwisy. Ścieżki w pliku compose są względne względem lokalizacji pliku — jeśli przeniesiesz plik, zaktualizuj `build.context`.

## Harmonogram i obsługa dat

- Harmonogram uruchamia się co minutę i wyszukuje zadania ze statusem `scheduled`, których `scheduledAt` jest mniejsze lub równe aktualnemu czasowi.
- Usługa akceptuje `scheduledAt` w elastycznych formatach ISO, takich jak `2025-11-26T16:50` (bez sekund). Kod normalizuje i parsuje takie ciągi przed podjęciem decyzji o uruchomieniu zadania.
- Wyświetlanie i logi używają formatu `%Y%m%d_%H%M%S` (np. `20251126_142530`).

## Integracja z Azure IoT Hub

- Użyj `azure-iothub` do wywoływania metod bezpośrednich na urządzeniach (np. `startPrint`) oraz `azure-iot-device` dla klienta urządzenia.
- Ze względu na różnice eksportów między CJS a ESM, kod wykrywa i stosuje `default` eksport jako fallback, gdy to konieczne.

## Logowanie, błędy i retry

- Usługa korzysta z `console.log` do widoczności. W produkcji przekieruj logi do scentralizowanego systemu logowania.
- Przy wywoływaniu metod urządzeń warto zaimplementować retry/backoff, aby obsłużyć przejściowe problemy sieciowe. Nieudane zadania powinny być oznaczane jako `failed` w Cosmos DB.

## Rozwiązywanie problemów

- `Message is not a constructor` — spowodowane niezgodnością eksportów w `azure-iot-device`. Repo zawiera defensywne rozpoznawanie eksportów; jeśli błąd nadal występuje, zbierz klucze eksportów i dopasujemy import.
- Ostrzeżenie ESM: `Reparsing as ES module because module syntax was detected` — rozwiązanie: albo włączyć ESM w `package.json` (`"type": "module"`) i dostosować `tsconfig`, albo kompilować do CommonJS i uruchamiać w trybie CJS (obecne obrazy Dockera domyślnie budują do CommonJS).

Jeśli budowanie Dockera kończy się błędem z powodu natywnych zależności, upewnij się, że etap budowy obrazu zawiera narzędzia budowania (w przykładowym builderze użyto Debian-slim — w razie potrzeby dodaj `build-essential`/`python3`).

## Testy i CI

- Pisanie testów jednostkowych z mockowaniem Cosmos (lub użycie emulatora) oraz IoT Hub. Użyj `nock` lub dependency injection do mockowania wywołań SDK Azure.
- Pipeline CI: uruchamiaj lint, testy, build, a następnie opcjonalnie buduj obrazy Docker i uruchamiaj testy smoke.

## Bezpieczeństwo i rekomendacje produkcyjne

- Przechowuj sekrety w Key Vault lub w systemie zarządzania sekretami CI. Nie commituj pliku `.env`.
- Stosuj zasadę najmniejszych uprawnień i rotuj klucze regularnie.
- Dodaj readiness/liveness probes i obsługę graceful shutdown.

## Wkład (Contributing)

Wkłady mile widziane. Pomysły:

- Rozszerzenie REST API o CRUD dla zadań i dodatkowe endpointy kontrolne.
- Dodanie uwierzytelniania i kontroli ról.
- Dodanie testów jednostkowych/integracyjnych oraz workflowów CI.
- Ulepszenie logowania i monitoringu.

Otwieraj issues lub PR-y ze swoimi propozycjami.

## Licencja

Projekt używa licencji ISC (zgodnie z `package.json`). Dodaj plik `LICENSE`, jeśli to konieczne.

---

Jeśli chcesz, mogę również:

- dodać `docker-compose.dev.yml` dla hot-reload i bind mountów,
- dodać przykładowe polecenia `curl` dla endpointów,
- dodać `CONTRIBUTING.md` z wytycznymi dotyczącymi PR-ów.
