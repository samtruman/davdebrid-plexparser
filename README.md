# DavDebrid Plex Parser

A self-hosted WebDAV server for Debrid services, automatically organizing media files into **Movies** and **TV Shows** for seamless integration with Plex and other media centers.

This fork adds a **Plex-style media classifier** to improve the reliability of movie/TV show detection. In particular, filenames containing standard episode markers such as `S01E01`, `S1E1`, or `1x01` are classified as TV shows instead of relying only on the number of videos in the parent directory.

## What's different from upstream

- Robust movie/TV show classification based on Plex-style episode naming patterns.
- Supports common episode formats such as `S01E01`, `S1E1`, `S01-E01`, `1x01`, and season/episode wording.
- Keeps the `All`, `Shows`, and `Movies` WebDAV directories.
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
Sugar.2024.S01E01.ITA.ENG.mkv
The.Acolyte.S01E08.ITA.ENG.mkv
Chernobyl.1x01.ITA.ENG.mkv
Operazione.Speciale.Lioness.S03E05.ITA.ENG.mkv
Lanterns.S01E01.ITA.ENG.mkv
```

These files are exposed under:

```text
/Shows/
```

### Movies

Video files without an episode marker are classified as movies, for example:

```text
Spider-Man.Homecoming.2017.4K.HDR.DV.2160p.BDRemux.mkv
Superman.2025.2160p.WEB-DL.mkv
Swapped - Al tuo posto (2026).mkv
```

These files are exposed under:

```text
/Movies/
```

Subtitles continue to be handled by the existing folder-organizer logic.

## Configuration

Server configuration is documented in [`src/lib/config.js`](./src/lib/config.js).

Folder organization is configured through `config.custom.yml`.

When mounted through WebDAV, the `Config` directory contains:

- **`config.yml`** — default configuration.
- **`config.custom.yml`** — user-customizable configuration.

The directory rules are processed sequentially. `All` remains non-unique, while `Shows` and `Movies` are unique directories.

## Fork status

This repository is a fork of [`arvida42/davdebrid`](https://github.com/arvida42/davdebrid) with the media-classification changes described above.

The project is intended to remain compatible with the upstream DavDebrid architecture while providing more reliable Plex-oriented movie and TV show detection.