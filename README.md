Mercure Hub
===========

> Deno implementation of the [Mercure protocol](https://mercure.rocks/).

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Usage](#usage)
    1. [Running in Docker](#running-in-docker)
    2. [Configuration](#configuration)
        1. [Available configuration options](#available-configuration-options)
        2. [Configuration file](#configuration-file)
        3. [Environment variables](#environment-variables)
        4. [Command line arguments](#command-line-arguments)
        5. [Transports](#transports)
            1. [Memory](#memory)
            2. [Redis](#redis)
            3. [PostgreSQL](#postgresql)
            4. [Apache Kafka](#apache-kafka)
            5. [EventStoreDB](#eventstoredb)
        6. [Authorization](#authorization)
4. [Contributing](#contributing)

Introduction
------------
[Mercure](https://mercure.rocks/) is an open-source solution for real-time communication, optimized for speed,
reliability, and battery efficiency. It serves as a modern alternative to the WebSocket API and the higher-level
libraries and services built on it.

Mercure excels at adding streaming and asynchronous capabilities to REST and GraphQL APIs. Leveraging HTTP and SSE, it
is natively supported by modern web browsers, mobile applications, and IoT devices.

This project is a Deno implementation of the Mercure protocol, providing a hub for managing subscriptions and publishing
events to clients. It is designed to be standards-compliant, extensible, reliable, and horizontally scalable, making it
suitable for production use-cases.

Installation
------------
To install the hub locally using deno, you can use the following command:

```bash
deno install \
  --name mercure \
  --allow-net \
  --allow-read \
  --allow-env \
  --env .env \
  https://deno.land/x/mercure/mod.ts
```

For running the hub in a Docker container, you can use the [
`radiergummi/mercure` image](https://hub.docker.com/repository/docker/radiergummi/mercure) provided from Docker Hub.

Usage
-----
Start the server by running the following command:

```bash
bin/mercure serve
```

### Running in Docker

We highly recommend using the provided Docker image to run the Mercure hub. You can start the server by running the
following command:

```bash
docker run --env-file=.env -p 8000:8000 radiergummi/mercure
```

### Configuration

The hub can be configured using a configuration file, environment variables, or command line arguments. These are merged
in the following order, with the last one taking precedence:

1. Configuration file
2. Environment variables
3. Command line arguments
4. Default values

#### Available configuration options

| Option                       | Description                                                                                                                                                                                 | Default                     |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------|
| `listenAddress`              | The address to listen on for incoming connections.                                                                                                                                          | `localhost:8000`            |
| `observabilityListenAddress` | The address to listen on for observability and metrics.                                                                                                                                     | *(same as `listenAddress`)* |
| `logLevel`                   | The minimum log level to use for runtime logging.<br>One of `"debug"`, `"info"`, `"warn"`, or `"error"`.                                                                                    | `info`                      |
| `logFormat`                  | The format to use for log output. If `auto`, it will use console in interactive mode, JSON otherwise.<br>One of `"console"`, `"json"`, or `"auto"`.                                         | `auto`                      |
| `logColors`                  | Enable colored log output. If `auto`, it will use colors only in interactive mode.<br>One of `true`, `false`, or `"auto"`.                                                                  | `auto`                      |
| `transportUri`               | The connection DSN to use for the event transport. The URL scheme will be used to identify the transport adapter to use.<br>See the [transports section](#transports) for more information. | `memory://`                 |
| `heartbeatInterval`          | The interval in milliseconds to send heartbeat messages to clients.                                                                                                                         | `30000`                     |
| `metrics`                    | Enable the OpenMetrics (Prometheus) metrics collector.                                                                                                                                      | `false`                     |
| `metricsEndpoint`            | Path to publish the Prometheus metrics endpoint at.                                                                                                                                         | `/metrics`                  |
| `subscriptionsApi`           | Enable the subscription API endpoints. Note that this introduces some overhead and should only be enabled if used.                                                                          | `false`                     |
| `queryParamAuthorization`    | Enable the use of the `authorization` query parameter for authentication.<br>See the [authorization section](#authorization) for more information.                                          | `false`                     |
| `anonymousAccess`            | Enable subscribers without a valid token to connect to the server. If disabled, clients must provide a valid JWT token to connect.                                                          | `false`                     |
| `cookieName`                 | The name of the cookie to use for authentication.                                                                                                                                           | `mercureAuthorization`      |
| `allowedOrigins`             | The list of origins allowed to connect to the server. The wildcard `*` can be used to allow all origins.                                                                                    | `[*]`                       |
| `jwk`                        | Encoded JSON Web Key (JWK) to use for verifying both publisher and subscriber JWTs.                                                                                                         | -                           |
| `subscriberJwk`              | Encoded JSON Web Key (JWK) to use for verifying subscriber JWTs only.                                                                                                                       | -                           |
| `publisherJwk`               | Encoded JSON Web Key (JWK) to use for verifying publisher JWTs only.                                                                                                                        | -                           |
| `jwksUrl`                    | URL of the JSON Web Key Set (JWK Set) to use for verifying both publisher JWTs and subscriber JWTs.                                                                                         | -                           |
| `subscriberJwksUrl`          | URL of the JSON Web Key Set (JWK Set) to use for verifying subscriber JWTs only.                                                                                                            | -                           |
| `publisherJwksUrl`           | URL of the JSON Web Key Set (JWK Set) to use for verifying publisher JWTs only.                                                                                                             | -                           |

#### Configuration file

To configure the hub using a configuration file, you can use either JSON, YAML, or TOML. The configuration file should
be named `mercure.(json|yaml|yml|toml)`, or a Deno module named `mercure.config.(ts|js)` with the configuration as its
default export. The configuration file should be placed in one of the following directories:

- The server working directory
- The user's home directory
- The XDG configuration directory (`$XDG_CONFIG_HOME` or `~/.config`)
- The `/etc/mercure` directory

#### Environment variables

All available configuration options can be set using environment variables. The environment variables should be prefixed
with `MERCURE_` and use uppercase letters. For example, the `logLevel` option can be set using the `MERCURE_LOG_LEVEL`.
The following table lists all available environment variables:

| Environment variable                   | Corresponding Option         | Notes                                                                                                                     |
|----------------------------------------|------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| `MERCURE_LISTEN_ADDRESS`               | `listenAddress`              |                                                                                                                           |
| `MERCURE_OBSERVABILITY_LISTEN_ADDRESS` | `observabilityListenAddress` |                                                                                                                           |
| `MERCURE_LOG_LEVEL`                    | `logLevel`                   |                                                                                                                           |
| `MERCURE_LOG_FORMAT`                   | `logFormat`                  |                                                                                                                           |
| `MERCURE_LOG_COLORS`                   | `logColors`                  | Accepts a literal `true` or `false` for a boolean value.                                                                  |
| `MERCURE_TRANSPORT_URI`                | `transportUri`               |                                                                                                                           |
| `MERCURE_HEARTBEAT_INTERVAL`           | `heartbeatInterval`          |                                                                                                                           |
| `MERCURE_METRICS`                      | `metrics`                    | Accepts a literal `true` or `false` for a boolean value.                                                                  |
| `MERCURE_METRICS_ENDPOINT`             | `metricsEndpoint`            |                                                                                                                           |
| `MERCURE_SUBSCRIPTIONS_API`            | `subscriptionsApi`           | Accepts a literal `true` or `false` for a boolean value.                                                                  |
| `MERCURE_QUERY_PARAM_AUTHORIZATION`    | `queryParamAuthorization`    | Accepts a literal `true` or `false` for a boolean value.                                                                  |
| `MERCURE_ANONYMOUS_ACCESS`             | `anonymousAccess`            | Accepts a literal `true` or `false` for a boolean value.                                                                  |
| `MERCURE_COOKIE_NAME`                  | `cookieName`                 |                                                                                                                           |
| `MERCURE_ALLOWED_ORIGINS`              | `allowedOrigins`             | Pass multiple origins by separating them with a comma (`,`).                                                              |
| `MERCURE_JWK`                          | `jwk`                        | For simplified handling, you can pass a base64-encoded key and prefix it with `base64:` to have it automatically decoded. |
| `MERCURE_SUBSCRIBER_JWK`               | `subscriberJwk`              | For simplified handling, you can pass a base64-encoded key and prefix it with `base64:` to have it automatically decoded. |
| `MERCURE_PUBLISHER_JWK`                | `publisherJwk`               | For simplified handling, you can pass a base64-encoded key and prefix it with `base64:` to have it automatically decoded. |
| `MERCURE_JWKS_URL`                     | `jwksUrl`                    |                                                                                                                           |
| `MERCURE_SUBSCRIBER_JWKS_URL`          | `subscriberJwksUrl`          |                                                                                                                           |
| `MERCURE_PUBLISHER_JWKS_URL`           | `publisherJwksUrl`           |                                                                                                                           |

> **Note:** You can set all variables from a secret file by appending the `_FILE` suffix to the environment variable
> name. If this variable contains a path to a file, the file's content will be used as the value. This is especially
> useful
> for sensitive information like JSON Web Keys or the transport URI.  
> For example, you can set the `MERCURE_JWK_FILE` environment variable to the path of a file containing the JSON Web
> Key.

#### Command line arguments

All available configuration options can be set using command line arguments. To view the full list of available options,
run the following command:

```bash
bin/mercure serve --help
```

#### Transports

The hub supports multiple transports for storing and distributing events. The transport to use can be specified using
the
`transportUri` configuration option. The URL scheme will be used to identify the transport adapter to use. The following
transports are available:

##### Memory

The memory transport stores events in memory and is the default transport. It is not recommended for production use as
it does not persist events across restarts, and won't synchronize events across multiple instances.

```bash
bin/mercure serve --transport-uri memory://
```

##### Redis

The Redis transport stores events in a [Redis stream](https://www.infoworld.com/article/2257727). This is the
recommended transport for production use. With a Redis transport, you can run multiple instances of the hub and have
them synchronize events across all instances.

```bash
bin/mercure serve --transport-uri redis://localhost:6379
```

##### PostgreSQL

The PostgreSQL transport stores events in a PostgreSQL database.  
**This transport is not yet implemented; contributions are welcome.**

```bash
bin/mercure serve --transport-uri postgresql://user:password@localhost:5432/database
```

##### Apache Kafka

The Apache Kafka transport stores events in an [Apache Kafka](https://kafka.apache.org/) cluster.  
**This transport is not yet implemented; contributions are welcome.**

```bash
bin/mercure serve --transport-uri kafka://localhost:9092
```

##### EventStoreDB

The EventStoreDB transport stores events in an [EventStoreDB](https://eventstore.com/) database.  
**This transport is not yet implemented; contributions are welcome.**

```bash
bin/mercure serve --transport-uri eventstoredb://user:password@localhost:2113
```

#### Authorization

The hub supports all ways of authenticating clients. By default, clients must provide a valid JWT token to connect

Contributing
------------
If you want to contribute to this project, please read the [contribution guidelines](CONTRIBUTING.md).

License
-------
This project is licensed under the MIT License.
