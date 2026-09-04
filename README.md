# DavDebrid Plex Parser

A self-hosted WebDAV server for Debrid services, automatically organizing media files into **Movies** and **TV Shows** for seamless integration with Plex and other media centers.

This fork adds a **Plex-style media classifier** to improve the reliability of movie/TV show detection. In particular, filenames containing standard episode markers such as `S01E01`, `S1E1`, or `1x01` are classified as TV shows instead of relying only on the number of videos in the parent directory.

It also adds an optional **generic HTTP webhook** for newly detected files. The webhook is deliberately service-agnostic: DavDebrid only reports the event and does not depend on a particular downstream application.

## What's different from upstream

- Robust movie/TV show classification based on Plex-style episode naming patterns.
- Supports common episode formats such as `S01E01`, `S1E1`, `S01-E01`, `1x01`, and season/episode wording.
- Keeps the `All`, `Shows`, and `Movies` WebDAV directories.
- Optional generic HTTP webhooks for events such as newly detected files.
- Webhook delivery includes a stable event ID so consumers can safely implement idempotency.
- Multiple webhook endpoints can subscribe independently to selected events.
- Multi-platform Docker image for `linux/amd64` and `linux/arm64`.
- Docker images are published automatically from the `main` branch through GitHub Actions.

## Docker

The custom image is published on Docker Hub as:

```text
samtruman/davdebrid-plexparser:latest
```

Run it with:

```bash
docker run -d \
  --name=davdebrid \
  -p 8080:8080 \
  --restart unless-stopped \
  -e DEBRID_ID=debridlink \
  -e DEBRID_API_KEY=apikey \
  -e DATA_FOLDER=/data \
  -v davdebrid_data:/data \
  samtruman/davdebrid-plexparser:latest
```

The published `8080` port is the **WebDAV server port**. DavDebrid does **not** open a separate listening port for webhooks: webhook delivery is outbound HTTP/HTTPS from DavDebrid to the configured consumer URL.

## Installation

### Run with Docker Compose and Mount with Rclone

1. Download the [`docker-compose.yml`](./docker-compose.yml) file.
2. Edit the `DEBRID_API_KEY`.
3. By default, the mount point is set to a Docker volume. You can change this to a local directory if preferred.
4. Run:

```bash
docker compose up -d
```

The included Rclone configuration uses a short directory cache time so that changes detected by DavDebrid become visible promptly through the mount.

### Run with Docker Compose, Mount with Rclone, and Plex

1. Download the [`docker-compose-plex.yml`](./docker-compose-plex.yml) file.
2. Configure `DEBRID_API_KEY` and the Plex settings.
3. Start the services:

```bash
docker compose -f docker-compose-plex.yml up -d
```

DavDebrid can automatically refresh Plex when changes are detected in the Debrid library.

## Rclone

DavDebrid exposes the organized media through WebDAV. A typical Rclone mount is:

```bash
export RCLONE_CONFIG_DAV_TYPE=webdav
export RCLONE_CONFIG_DAV_URL=http://localhost:8080
export RCLONE_CONFIG_DAV_VENDOR=other

rclone mount dav: /mnt/dav \
  --dir-cache-time 5s \
  --allow-other \
  --vfs-cache-mode full \
  --vfs-cache-max-size 500M \
  --vfs-read-chunk-size 4M \
  --vfs-read-chunk-size-limit 256M \
  --vfs-fast-fingerprint \
  --allow-non-empty
```

The WebDAV root contains:

```text
/
├── All/
├── Shows/
├── Movies/
└── Config/
```

## Media classification

The fork uses a dedicated classifier before the generic folder-organizer rules are applied.

### TV Shows

A video is classified as a TV episode when its filename contains a recognized episode marker, for example:

```text
Example.Show.S01E01.1080p.WEB-DL.mkv
Another.Series.S02E03.2160p.WEB-DL.mkv
Sample.Show.1x04.1080p.WEB-DL.mkv
Demo.Series.S03-E07.1080p.WEB-DL.mkv
```

These files are exposed under:

```text
/Shows/
```

### Movies

Video files without an episode marker are classified as movies, for example:

```text
Example.Movie.2025.2160p.WEB-DL.mkv
Another.Movie.2024.1080p.BluRay.mkv
Sample.Film.2026.2160p.WEB-DL.mkv
```

These files are exposed under:

```text
/Movies/
```

Subtitles continue to be handled by the existing folder-organizer logic.

## Webhooks

Webhooks provide a generic integration point for applications that need to react when DavDebrid detects new files in the Debrid library.

DavDebrid already checks the Debrid service for recently added files. When a new file is detected, the webhook system can send an HTTP `POST` notification to one or more configured services. This avoids requiring external applications to poll the filesystem or WebDAV mount themselves.

The feature is deliberately **service-agnostic**. DavDebrid does not know whether the receiving service is a media manager, an indexer, an automation service, a notification system, or a custom application. Each consumer decides what to do with the event.

For example, a consumer could receive a `new_files` event and then:

```text
DavDebrid
   │
   ├── detects new file
   │
   ▼
HTTP POST
   │
   ├── Media manager
   ├── Indexer
   ├── Notification service
   └── Custom application
```

### Networking and ports

DavDebrid is the **webhook sender**, not the webhook server.

There is no dedicated webhook listener and therefore no `WEBHOOK_PORT` setting in DavDebrid. The receiving service owns its own HTTP/HTTPS listener and port. The complete destination, including the port when required, is specified in the webhook URL.

#### Container-to-container

If the consumer runs in another Docker container on a shared Docker network, use the consumer's Docker DNS name and its **internal container port**:

```text
http://media-service:8080/webhook
```

No host port needs to be published for this communication. For example:

```text
DavDebrid container
       │
       │ HTTP POST
       ▼
media-service:8080
       │
       └── webhook consumer
```

This is the preferred setup when both services run on the same Docker network.

#### Service running on the Docker host

If the consumer runs directly on the Docker host rather than in a container, configure an address reachable from the container, together with the port on which the host service listens. The exact host address depends on the Docker/network configuration.

#### External service

A consumer on another server can be addressed with a normal HTTP or HTTPS URL:

```text
https://example.example.com/api/webhook
```

In this case the receiving service is responsible for exposing and protecting its endpoint. DavDebrid only makes the outbound request.

### Configuration

Webhooks are optional and disabled unless `WEBHOOKS` is configured.

`WEBHOOKS` accepts a JSON array. Each target can subscribe to one or more event types:

```bash
-e 'WEBHOOKS=[{"url":"http://example-service:8080/webhook","events":["new_files"]}]'
```

The port in the URL (`8080` in this example) belongs to the **receiving service**, not to DavDebrid.

Multiple independent targets are supported:

```bash
-e 'WEBHOOKS=[{"url":"http://service-a:8080/webhook","events":["new_files"]},{"url":"http://service-b:9000/davdebrid","events":["new_files"]}]'
```

Each consumer can use a different hostname, path, and port.

If `events` is omitted, the endpoint receives `new_files` events by default. Use `*` to subscribe to all supported events.

The optional `WEBHOOK_TIMEOUT` environment variable controls the HTTP request timeout in milliseconds and defaults to `10000` (10 seconds).

### `new_files` event

For newly detected files, DavDebrid sends an HTTP `POST` with `Content-Type: application/json` and a payload similar to:

```json
{
  "event": "new_files",
  "event_id": "stable-event-id",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "source": "AD",
  "files": [
    {
      "id": "123456",
      "name": "Example.Show.S01E01.1080p.WEB-DL.mkv",
      "size": 123456789,
      "type": "video"
    }
  ]
}
```

The request also includes:

- `X-DavDebrid-Event` — event type.
- `X-DavDebrid-Event-ID` — stable event identifier.

The event ID is derived from the event type and the detected file IDs. Consumers should use it for idempotency because a failed delivery is retried on a later recent-files check.

DavDebrid considers a delivery successful only when the HTTP request completes successfully with a 2xx response. The response body is ignored.

If one or more webhook deliveries fail, the newly detected files remain eligible for delivery on the next recent-files check. This makes the webhook a notification mechanism rather than a message queue: consumers should process events idempotently and return a successful HTTP response once the event has been accepted.

## Classified source snapshot (optional)

An integration may need an explicit repair/reconciliation pass after it was
offline. Set `SOURCE_SNAPSHOT_TOKEN` to enable this read-only internal API:

```bash
-e SOURCE_SNAPSHOT_TOKEN='a-long-random-secret'
```

Then an authorized consumer can request:

```text
GET /api/source-snapshot
Authorization: Bearer a-long-random-secret
```

The response contains only current classified video files: stable file ID,
filename, size, parent metadata, and the DavDebrid `Movies`/`Shows`
classification. Torrent sidecars such as `.txt`, `.nfo`, images and other
unclassified files are deliberately excluded. It does **not** contain a
debrid download URL. If `SOURCE_SNAPSHOT_TOKEN` is not configured, the
endpoint returns `404`; an invalid token returns `401`.

The snapshot is independent of the normal change detector: reading it does not
update the detector cache or emit a webhook.

### Example: Docker Compose

A consumer on the same Docker network can be configured directly with its service name:

```yaml
environment:
  WEBHOOKS: >-
    [{"url":"http://consumer:8080/webhook","events":["new_files"]}]
```

The `8080` above is the port exposed **inside the Docker network by the consumer service**. It does not need to be published on the host.

If the consumer instead listens internally on `9000`, simply use:

```yaml
environment:
  WEBHOOKS: >-
    [{"url":"http://consumer:9000/webhook","events":["new_files"]}]
```

No DavDebrid code change is required when changing the consumer port.

### Security

Webhook URLs are configured by the operator and may contain internal network addresses. Webhooks should normally be sent to trusted services on a private network or otherwise protected using the deployment's network and access controls.

If a webhook consumer is exposed outside the Docker network, use HTTPS and appropriate authentication/access controls. DavDebrid currently provides event headers and a stable event ID, but these are **not authentication credentials**.

## Configuration

Server configuration is documented in [`src/lib/config.js`](./src/lib/config.js).

### Webhooks

Configure `WEBHOOKS` as a JSON array.  A target may subscribe to `new_files`,
`deleted_files`, or `*`:

```bash
WEBHOOKS='[{"url":"http://consumer:8080/webhook","events":["new_files","deleted_files"]}]'
```

For `new_files`, DavDebrid preserves its Movies/Shows classification and sends
it as `files[].category`.  Consumers should treat that category as
source-authoritative rather than building a second Debrid inventory or
reclassifying paths.  DavDebrid refreshes Plex before attempting webhook
delivery.

`WEBHOOK_TIMEOUT` is the delivery budget in milliseconds; its default is
`300000` (five minutes) for mount-backed consumers.  Failed deliveries remain
eligible for retry on the next recent-files check.

Folder organization is configured through `config.custom.yml`.

When mounted through WebDAV, the `Config` directory contains:

- **`config.yml`** — default configuration.
- **`config.custom.yml`** — user-customizable configuration.

The directory rules are processed sequentially. `All` remains non-unique, while `Shows` and `Movies` are unique directories.

## Fork status

This repository is a fork of [`arvida42/davdebrid`](https://github.com/arvida42/davdebrid) with the media-classification and generic webhook changes described above.

The project is intended to remain compatible with the upstream DavDebrid architecture while providing more reliable Plex-oriented movie and TV show detection and an optional integration point for external services.
