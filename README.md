# AddiPi Printer Service

AddiPi Printer Service to lekki mikroserwis odpowiedzialny za zarządzanie i wykonywanie zadań drukowania. Obsługuje harmonogramowanie zadań, przechowywanie ich w Azure Cosmos DB oraz wysyła komendy startu druku do urządzeń przez Azure IoT Hub (MQTT). Udostępnia też prosty serwer HTTP z endpointami health i podstawowego zarządzania.

> Serwis obsługujący zadania drukowania: czyta zaplanowane zadania z Cosmos DB, wysyła komendy do urządzeń przez Azure IoT i udostępnia prosty HTTP health/management API.

## Najważniejsze informacje
- Baza zadań: Azure Cosmos DB (kontener `addipi.jobs`)
- Komunikacja z urządzeniami: `azure-iot-device` + MQTT (`azure-iot-device-mqtt`)
- Scheduler: `node-cron` (sprawdza zaplanowane zadania co minutę)
- Prosty serwer HTTP (Express) z endpointami health i root

## Zmienne środowiskowe (wymagane)
- `IOT_CONN_STRING` — connection string do IoT Hub (device connection string lub odpowiedni connection string używany w aplikacji)
- `COSMOS_ENDPOINT` — endpoint Cosmos DB (np. `https://<account>.documents.azure.com:443/`)
- `COSMOS_KEY` — primary key do Cosmos DB

Przykład (PowerShell):

```powershell
$env:IOT_CONN_STRING = "HostName=...;DeviceId=...;SharedAccessKey=..."
$env:COSMOS_ENDPOINT = "https://<account>.documents.azure.com:443/"
$env:COSMOS_KEY = "<primary-key>"
```

## Szybkie uruchomienie lokalne

1. Zainstaluj zależności:

```powershell
npm install
```

2. Uruchom w trybie deweloperskim (ts-node-dev):

```powershell
npm run dev
```

3. Domyślny HTTP server nasłuchuje na porcie `3050` (możesz zmienić port w `src/index.ts`).

Endpoints dostępne lokalnie:
- `GET /` — prosty root (status serwisu)
- `GET /printer/health` — health check: `{ "ok": true, "time": "..." }`

## Co robi scheduler
- Co minutę (crontab `* * * * *`) funkcja `startScheludedJobs` sprawdza Cosmos DB dla zadań o statusie `scheluded` i `scheludedAt <= now`.
- Dla każdego odnalezionego zadania:
  - ustawia `status = 'printing'` i zapisuje dokument w Cosmos
  - wysyła wiadomość `print_start` do urządzenia przez IoT Hub

Uwaga: obecny kod zapisuje i wysyła prostą wiadomość JSON `{ event: 'print_start', fileId }`.

## Typowe problemy i rozwiązania

- Błąd przy uruchomieniu: "The requested module 'azure-iot-device' does not provide an export named 'Message'"
  - Przyczyna: mieszanka ESM/CommonJS w paczkach `azure-iot-device`. Repo może być skonfigurowane do ESM (patrz `tsconfig.json`) — w kodzie używamy bezpiecznych namespace-importów (`import * as iot from 'azure-iot-device'`) i wyciągamy `Client`/`Message` z namespace, co eliminuje błąd.

- TypeScript pokazuje diagnostykę wewnątrz `node_modules` (np. `azure-iot-common/tsconfig.json`)
  - W repo znajduje się skrypt `scripts/remove-bad-tsconfig.js` uruchamiany jako `postinstall`, który usuwa problematyczny `tsconfig.json` z `node_modules` (łatwe obejście dla deweloperów). Możemy też dodać lokalne deklaracje typów, by poprawić typowanie.

## Bezpieczeństwo i produkcja
- Nie commituj connection stringów ani kluczy — używaj secretów (Azure Key Vault / GitHub Secrets) i mechanizmów rotacji kluczy.
- W produkcji: uruchamiaj proces w kontenerze lub App Service/ACI; zadbaj o restart/backoff przy błędach IoT Hub i bezpieczne logowanie.

## Dalsze kroki / rekomendacje
- Dodać pełne REST API dla zarządzania zadaniami (`/api/v1/jobs`, `/api/v1/jobs/{id}/cancel`, `/api/v1/queue/next`, itp.).
- Dodać autoryzację (JWT + role) dla endpointów administracyjnych.
- Dodać pliki deklaracji typów dla `azure-iot-device` i `azure-iot-device-mqtt` lub korzystać z `@types/...` jeśli będą dostępne.
- Testy jednostkowe: mockować Cosmos i IoT Hub (np. `nock` / in-memory fakes) i uruchamiać w CI.


