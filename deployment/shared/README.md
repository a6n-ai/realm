# Shared infra

Resources used by **more than one app**, running on their own box(es),
independent of any app stack. Apps reach them by URL over the VPC.

**Today:** RabbitMQ (cross-app message bus).
**Deliberately not here:** Redis — it stays colocated per-app (isolated cache,
no network hop, no shared-eviction blast radius). Only promote something to this
folder when a second app genuinely needs to share the same instance/state.

## Deploy

```sh
# on the shared box, from this dir
cp .env.shared.example .env.shared   # fill in passwords
./deploy.sh              # brings up everything in the umbrella
./deploy.sh rabbitmq     # or a single service (own box)
```

Rarely changes — **not** on the git-push path. Deploy by hand when you touch it.

## How apps connect

| Var | Value |
|-----|-------|
| `RABBITMQ_URL` | `amqp://USER:PASS@<rabbit-ip>:5672` — unset ⇒ producer falls back to inline push |

## Security — mandatory

- **Security groups** are the fence. Allow `:5672` **only** from your app boxes'
  SG. Never `0.0.0.0/0`.
- Broker carries real creds as defense-in-depth.
- Same VPC/subnet as the app boxes — traffic never leaves AWS's network.
- Mgmt UI (`:15672`) is bound to localhost. Reach it via SSH tunnel.

## Why the queue is shared but the app box isn't HA

A single app EC2 is a SPOF — if it dies, that app is down. The shared broker on
its own box means a queue outlives any one app box: messages persist (named
volume) and are still there when the app box restarts or is replaced. To remove
the app-box SPOF itself, run 2+ app boxes behind the load balancer, all pointing
at this same broker — that's exactly what putting the queue here enables.

## Adding a future shared resource

1. New subdir `deployment/shared/<name>/docker-compose.yml`.
2. Add it to the umbrella `include:`.
3. Add its env to `.env.shared.example`.
