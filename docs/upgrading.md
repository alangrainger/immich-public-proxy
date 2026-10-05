# Upgrading

## Updating IPP

IPP keeps no state, so updating is a matter of pulling the new image and recreating the container:

```bash
docker-compose pull
docker-compose up -d
```

If you pin a version tag rather than `latest`, bump it in your `docker-compose.yml` first (see
[Docker images](/installation#docker-images) for the tag scheme).

Check the [release notes](https://github.com/alangrainger/immich-public-proxy/releases) before moving to a new major
version. Breaking changes and renamed config keys land in major versions and are listed there.

## Upgrading to 4.0

- **Immich 3.0.0 or newer is required.** Upgrade Immich first.
- **Old config keys are no longer read.** Check your `config.json` against [Renamed config keys](/config/upgrading).
- **A custom `invalidRequestHandler.js` must be copied again from the 4.0 image.** A copy taken from 3.x fails to
  load. See [Custom function](/config/error-responses#custom-function).

## Immich version

IPP requires **Immich 3.0.0 or newer** and checks the server version at startup. Against an older Immich it logs a
fatal error and exits; if it can't determine the version at all (Immich unreachable), it logs a warning and carries on.

When you upgrade Immich, check the IPP release notes for a matching release, as changes to Immich's API are picked up
there.

## Config keys

Config keys are renamed only in major versions, and the old name stops working then. [Renamed config
keys](/config/upgrading) maps each old key to its current name.
