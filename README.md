# DavDebrid Plex Parser

A self-hosted WebDAV server for Debrid services, automatically organizing media files into **Movies** and **TV Shows** for seamless integration with Plex and other media centers.

This fork adds a **Plex-style media classifier** to improve the reliability of movie/TV show detection. In particular, filenames containing standard episode markers such as `S01E01`, `S1E1`, or `1x01` are classified as TV shows instead of relying only on the number of videos in the parent directory.

It also adds an optional **generic HTTP webhook** for newly detected files. The webhook is deliberately service-agnostic: DavDebrid only reports the event and does not depend on CineCircle, Riven, Sonarr, Radarr, or any other consumer.

## What's different from upstream

- Robust movie/TV show classification based on Plex-style episode naming patterns.
- Supports common episode formats such as `S01E01`, `S1E1`, `S01-E01`, `1x01`, and season/episode wording.
- Keeps the `All`, `Shows`, and `Movies` WebDAV directories.
- Optional generic HTTP webhooks for events such as newly detected files.
- Webhook delivery includes a stable event ID so consumers can safely implement idempotency.
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

Webhooks are optional and disabled unless `WEBHOOKS` is configured.

`WEBHOOKS` accepts a JSON array. Each target can subscribe to one or more event types:

```bash
-e 'WEBHOOKS=[{"url":"http://example-service:8080/webhook","events":["new_files"]}]'
```

If `events` is omitted, the endpoint receives `new_files` events by default. Use `*` to subscribe to all supported events.

The optional `WEBHOOK_TIMEOUT` environment variable controls the HTTP request timeout in milliseconds and defaults to `10000`.

For a newly detected file, DavDebrid sends an HTTP `POST` with `Content-Type: application/json` and a payload similar to:

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

The request also includes `X-DavDebrid-Event` and `X-DavDebrid-Event-ID` headers. Consumers should use the event ID for idempotency because a failed delivery is retried on a later recent-files check.

DavDebrid does not interpret the webhook response body. A non-2xx response or request failure is considered an unsuccessful delivery.

## Configuration

Server configuration is documented in [`src/lib/config.js`](./src/lib/config.js).

Folder organization is configured through `config.custom.yml`.

When mounted through WebDAV, the `Config` directory contains:

- **`config.yml`** — default configuration.
- **`config.custom.yml`** — user-customizable configuration.

The directory rules are processed sequentially. `All` remains non-unique, while `Shows` and `Movies` are unique directories.

## Fork status

This repository is a fork of [`arvida42/davdebrid`](https://github.com/arvida42/davdebrid) with the media-classification and generic webhook changes described above.

The project is intended to remain compatible with the upstream DavDebrid architecture while providing more reliable Plex-oriented movie and TV show detection and an optional integration point for external services.