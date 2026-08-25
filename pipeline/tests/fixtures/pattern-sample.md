# API Security Pattern

The **API Security Pattern** is a pattern that protects APIs using authentication, authorization, and throttling at a dedicated gateway layer.

## Overview

An API gateway is a component that sits between clients and backend services.
It enforces security policies centrally.

### Key elements

1. Authenticate every request at the edge
2. Authorize access with scoped tokens
3. Throttle abusive clients

## Threats

Common threats include token leakage and replay attacks.

| Threat | Mitigation |
| ------ | ---------- |
| Replay | Nonces |
| Leak   | Short TTL |

![Gateway diagram](images/gateway.png)

```yaml
gateway:
  auth: jwt
```

> Defense in depth beats a single control.
